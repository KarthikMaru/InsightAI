// File path: frontend/src/hooks/useDatasets.js
// Purpose: Shared logic for Dashboard/Analytics/Explorer pages — loads the
// user's datasets and remembers which one is selected across visits.

import { useEffect, useState } from 'react';
import datasetService from '../services/datasetService';

const STORAGE_KEY = 'insightai_selected_dataset';

export default function useDatasets() {
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await datasetService.list();
        const readyDatasets = list.filter((d) => d.status === 'ready');
        setDatasets(readyDatasets);

        const stored = Number(localStorage.getItem(STORAGE_KEY));
        const validStored = readyDatasets.find((d) => d.id === stored);
        const initial = validStored ? stored : readyDatasets[0]?.id || null;
        setSelectedId(initial);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectDataset = (id) => {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  return { datasets, selectedId, selectDataset, loading };
}
