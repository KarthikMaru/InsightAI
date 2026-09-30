// File path: backend/services/geminiService.js
// Purpose: All calls to the Google Gemini API live here. Every prompt in
// this file is built around one rule: Gemini only ever reasons over data
// we already retrieved from SQL — it never invents figures. It also never
// executes anything itself; for NL-to-SQL it only proposes a query, which
// the caller must run through sqlValidator before execution.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const ApiError = require('../utils/ApiError');
const { OPERATION_SCHEMA_DESCRIPTION } = require('./datasetModificationService');

// gemini-1.5-flash has been deprecated/shut down by Google; gemini-2.5-flash
// is the current fast/cheap default as of this writing. Still fully
// overridable via GEMINI_MODEL in .env for whichever model is current
// when you're running this — check https://ai.google.dev/gemini-api/docs/models
// for the latest available models before deploying.
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 25000;
const UNAVAILABLE_MESSAGE = 'AI service is currently unavailable. Please check your Gemini API configuration or try again.';

function getModel() {
  if (!process.env.GEMINI_API_KEY) {
    // Missing key is a server configuration problem, not a transient
    // outage — distinct message/status so it's not confused with "try
    // again in a minute".
    throw new ApiError(500, UNAVAILABLE_MESSAGE);
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: MODEL_NAME });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), ms)),
  ]);
}

// Every Gemini call in this file funnels through here, so timeout/
// rate-limit/invalid-key/empty-response handling is written exactly
// once. Whatever goes wrong, the app surfaces a clear ApiError and
// keeps running — it never lets a Gemini failure crash the request or
// silently pass through as a false "success".
async function callGemini(prompt) {
  const model = getModel(); // throws ApiError(500) if unconfigured — let it propagate as-is

  try {
    const result = await withTimeout(model.generateContent(prompt), REQUEST_TIMEOUT_MS);
    const text = result?.response?.text?.()?.trim();
    if (!text) throw new Error('EMPTY_RESPONSE');
    return text;
  } catch (err) {
    console.error('Gemini API error:', err.message || err);

    if (err.message === 'GEMINI_TIMEOUT') {
      throw new ApiError(504, 'The AI service took too long to respond. Please try again.');
    }
    const message = String(err.message || '');
    if (/api key not valid|api_key_invalid|permission_denied|unauthorized/i.test(message)) {
      throw new ApiError(401, UNAVAILABLE_MESSAGE);
    }
    if (/429|rate limit|quota|resource_exhausted/i.test(message)) {
      throw new ApiError(429, 'The AI service is receiving too many requests right now. Please try again shortly.');
    }
    throw new ApiError(502, UNAVAILABLE_MESSAGE);
  }
}

function stripCodeFences(text) {
  return text
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim();
}

const geminiService = {
  /**
   * Answers a free-form business question using ONLY the structured data
   * bundle passed in (KPIs, trends, top/weak products, top customers,
   * category/region performance — whatever the caller already queried
   * from SQL). The model is explicitly instructed not to invent numbers.
   */
  async generateBusinessInsight({ question, dataBundle }) {
    const prompt = `You are InsightAI, a business intelligence assistant embedded in a sales analytics platform.

A business owner asked: "${question}"

Here is the ACTUAL data retrieved from their SQL database for this question (JSON):
${JSON.stringify(dataBundle, null, 2)}

Rules:
- Base your entire answer strictly on the JSON data above. Do not invent numbers, trends, or facts not present in it.
- If the data doesn't contain enough information to answer confidently, say so plainly instead of guessing.
- Write like a sharp, friendly business analyst — clear, concise, and specific (cite actual figures from the data).
- End with one short, actionable recommendation grounded in the data.
- Keep the whole answer under 180 words. No markdown headers, just plain prose (short paragraphs or a short bullet list is fine).`;

    return callGemini(prompt);
  },

  /**
   * Generates categorized automated insights (sales, customer, regional,
   * product) from a full analytics summary. Returns a parsed array of
   * { category, title, content }.
   */
  async generateAutomatedInsights({ summary }) {
    const prompt = `You are InsightAI, a business intelligence assistant.

Here is a full analytics summary for a business, retrieved directly from their SQL database (JSON):
${JSON.stringify(summary, null, 2)}

Generate 4 to 8 concise, specific business insights based ONLY on this data, spread across these categories: "sales", "customer", "regional", "product".

Respond with ONLY a valid JSON array (no markdown, no commentary) in this exact shape:
[
  { "category": "sales", "title": "short title (max 8 words)", "content": "1-2 sentence insight grounded in the data, citing real figures" }
]

Every "content" must reference actual numbers from the JSON above. Do not fabricate anything not derivable from it.`;

    const raw = await callGemini(prompt);
    const cleaned = stripCodeFences(raw);
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      return parsed.filter((i) => i.category && i.title && i.content);
    } catch (err) {
      throw new ApiError(502, 'The AI returned an unexpected format. Please try again.');
    }
  },

  /**
   * Converts a natural-language question into a single read-only SQL
   * query string. The caller MUST pass this through sqlValidator before
   * ever executing it — this function only asks the model to write SQL,
   * it does not vouch for its safety.
   */
  async generateSqlFromQuestion({ question }) {
    const schemaDescription = `
Tables available (read-only):

sales_records(id, order_id, order_date, product_id, customer_id, region_id, quantity, sales, profit, discount)
products(id, name, category_id)
categories(id, name)
customers(id, external_customer_id, name)
regions(id, name)

Relationships: sales_records.product_id -> products.id, products.category_id -> categories.id,
sales_records.customer_id -> customers.id, sales_records.region_id -> regions.id.
Do NOT reference dataset_id or any other table — the data is already scoped to one business's dataset for you.`;

    const prompt = `You are a PostgreSQL expert. Convert the following business question into a single, safe, read-only SQL query.

Schema:
${schemaDescription}

Question: "${question}"

Strict rules:
- Output ONLY the raw SQL query. No markdown code fences, no explanation, no semicolon at the end.
- The query MUST start with SELECT.
- Use only the tables listed above.
- Never use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, or any DDL/DML keyword.
- Do not use CTEs (WITH ...). Write a single SELECT statement, using JOINs/GROUP BY/ORDER BY/LIMIT as needed.
- Always include a reasonable LIMIT (e.g. 20) unless the question clearly asks for a single aggregate value.`;

    const raw = await callGemini(prompt);
    return stripCodeFences(raw).replace(/;$/, '').trim();
  },

  /**
   * Given a question, the SQL that was run, and the actual result rows,
   * produces a short plain-English explanation of what the result means.
   */
  async explainQueryResult({ question, sql, resultRows }) {
    const prompt = `You are InsightAI, a business intelligence assistant.

A user asked: "${question}"
This SQL query was run against their data:
${sql}

It returned these actual rows (JSON):
${JSON.stringify(resultRows.slice(0, 20), null, 2)}

In 2-4 sentences, explain what this result means for the business in plain English, citing the real values above. Do not restate the SQL. No markdown.`;

    return callGemini(prompt);
  },

  /**
   * The general-purpose counterpart to generateBusinessInsight(), used
   * for any non-sales dataset. Grounded on the dataset's profile
   * (schema, inferred types, missing/unique counts) plus the computed
   * statistical summary (genericAnalyticsService.buildFullSummary) —
   * never on the raw row data, and never on assumptions about what the
   * dataset represents. Explicitly told to say so, rather than
   * hallucinate, when the data can't answer the question.
   */
  async generateGenericBusinessInsight({ question, profile, summary }) {
    const prompt = `You are InsightAI, a general-purpose data analysis assistant. You have NO prior knowledge of what this specific dataset represents — infer everything from the schema and statistics below.

A user asked: "${question}"

Dataset schema (column name -> inferred type, e.g. integer/float/date/boolean/categorical/text/identifier):
${JSON.stringify(profile.columns.map((c) => ({ name: c.name, type: c.inferredType, missingPercentage: c.missingPercentage, uniqueCount: c.uniqueCount, sampleValues: c.sampleValues })), null, 2)}

Computed statistics for this dataset (JSON — the ONLY numbers you may cite):
${JSON.stringify(summary, null, 2)}

Rules:
- Base your entire answer strictly on the schema and statistics above. Do not invent numbers, columns, or facts not present in them.
- If the question asks about something this dataset's columns cannot support (e.g. asking about a column that doesn't exist), say so plainly and suggest what IS answerable instead — do not guess.
- Write like a sharp, friendly data analyst — clear, concise, specific, citing actual figures from the JSON.
- Keep the whole answer under 180 words. No markdown headers — plain prose or a short bullet list.`;

    return callGemini(prompt);
  },

  /**
   * General-purpose counterpart to generateAutomatedInsights(), for any
   * non-sales dataset. Categories are generic ("overview", "quality",
   * "patterns", "relationships") rather than sales/customer/regional/
   * product, since those don't apply to an arbitrary dataset.
   */
  async generateGenericAutomatedInsights({ profile, summary }) {
    const prompt = `You are InsightAI, a general-purpose data analysis assistant. You have NO prior knowledge of what this dataset represents — infer everything from the schema and statistics below.

Dataset schema:
${JSON.stringify(profile.columns.map((c) => ({ name: c.name, type: c.inferredType, missingPercentage: c.missingPercentage, uniqueCount: c.uniqueCount })), null, 2)}

Computed statistics (JSON):
${JSON.stringify(summary, null, 2)}

Generate 4 to 8 concise, specific insights based ONLY on this data, spread across these categories: "overview", "quality" (missing values / data quality issues), "patterns" (distributions, outliers, notable categories), "relationships" (correlations, group comparisons, trends over time — only if the data above actually contains any).

Respond with ONLY a valid JSON array (no markdown, no commentary) in this exact shape:
[
  { "category": "overview", "title": "short title (max 8 words)", "content": "1-2 sentence insight grounded in the data, citing real figures" }
]

Every "content" must reference actual figures from the JSON above. Do not fabricate anything not derivable from it. If there isn't enough data for a category (e.g. no date columns, so no time trends), simply omit that category rather than inventing something.`;

    const raw = await callGemini(prompt);
    const cleaned = stripCodeFences(raw);
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      return parsed.filter((i) => i.category && i.title && i.content);
    } catch (err) {
      throw new ApiError(502, 'The AI returned an unexpected format. Please try again.');
    }
  },

  /**
   * "Generate Dataset with AI". Asks Gemini to invent a schema + rows
   * from a natural-language description. The output is used as a HINT
   * only — the caller (see datasetController.generateAiDataset) never
   * trusts the declared types or row shape as-is; it re-parses the JSON
   * through the exact same pipeline an uploaded .json file goes through
   * (services/parsers/jsonParser.js -> datasetProfiler), so a generated
   * dataset gets identical validation, type inference, and row/column
   * caps as any other upload. This function's only job is to produce
   * plausible-looking JSON text; it is not trusted further than that.
   */
  async generateDatasetFromPrompt({ prompt, rowCount }) {
    const requestedRows = Math.min(Math.max(parseInt(rowCount, 10) || 50, 1), 300);
    const generationPrompt = `You generate example tabular datasets as strict JSON for a data analysis tool.

The user asked for: "${prompt}"

Generate exactly ${requestedRows} rows of realistic, varied, internally-consistent sample data matching that request. Infer sensible column names and types from the request.

Respond with ONLY valid JSON (no markdown fences, no commentary) in exactly this shape:
{
  "datasetName": "Short Title Case Name",
  "columns": [{ "name": "column_name", "dataType": "Text" }],
  "rows": [ { "column_name": "value" } ]
}

Rules:
- "dataType" must be one of: Text, Integer, Decimal, Boolean, Date, DateTime.
- Every row must be a flat JSON object using exactly the column names declared in "columns".
- Dates must be ISO 8601 strings (YYYY-MM-DD).
- Generate exactly ${requestedRows} rows — no more, no fewer.
- Do not wrap the JSON in markdown code fences. Output raw JSON only.`;

    return callGemini(generationPrompt);
  },

  /**
   * "AI-powered dataset modification" — step 1 of propose→preview→
   * confirm→apply. The AI's ONLY job is to classify a natural-language
   * instruction into one of the fixed operation shapes in
   * datasetModificationService.OPERATION_SCHEMA_DESCRIPTION. It never
   * writes code and never touches the dataset — the returned JSON is
   * fully re-validated by datasetModificationService.validateOperation
   * before anything is computed or previewed.
   */
  async proposeDatasetModification({ instruction, profile }) {
    const schemaSummary = profile.columns.map((c) => ({ name: c.name, type: c.inferredType }));
    const prompt = `A user wants to modify a dataset. Here is its current schema (column name -> type):
${JSON.stringify(schemaSummary, null, 2)}

The user's instruction: "${instruction}"

${OPERATION_SCHEMA_DESCRIPTION}`;

    return callGemini(prompt);
  },

  /**
   * Generates synthetic rows matching the CURRENT dataset's exact schema
   * (not a new one), conditioned on a small sample of real rows so the
   * output is stylistically consistent. Like generateDatasetFromPrompt,
   * this is a hint only — the caller re-validates and coerces every
   * value to its column's declared type before anything is written.
   */
  async generateSyntheticRows({ profile, sampleRows, count }) {
    const columnList = profile.columns.map((c) => `${c.name} (${c.inferredType})`).join(', ');
    const prompt = `Generate ${count} new synthetic data rows for a dataset with these columns: ${columnList}.

Here are some real existing rows for style/range reference (JSON):
${JSON.stringify(sampleRows.slice(0, 10), null, 2)}

Respond with ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{ "rows": [ { "column_name": "value" } ] }

Rules:
- Every row must use exactly these column names: ${profile.columns.map((c) => c.name).join(', ')}.
- Values should be realistic and consistent with the existing data's style and typical ranges, but not simply copied.
- Generate exactly ${count} rows.
- Output raw JSON only, no markdown code fences.`;

    return callGemini(prompt);
  },
};

module.exports = geminiService;
