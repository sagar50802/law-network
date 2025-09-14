import { useState, useEffect } from 'react';

const usePollApproval = ({ type, id, playlist, subject, gmail, intervalMs = 5000 }) => {
  const [approved, setApproved] = useState(false);
  const [expireAtMs, setExpireAtMs] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!gmail) {
      setApproved(false);
      setExpireAtMs(0);
      setChecking(false);
      return;
    }

    setChecking(true);

    const params = new URLSearchParams({
      type,
      gmail,
    });

    if (id) params.append('id', id);
    if (playlist) params.append('playlist', playlist);
    if (subject) params.append('subject', subject);

    const url = `/api/access/check?${params.toString()}`;

    const poll = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setApproved(!!data.approved);
        setExpireAtMs(data.expireAt ? Number(data.expireAt) : 0);
      } catch (err) {
        console.error('Poll error:', err);
      }
    };

    poll();

    const intervalId = setInterval(poll, intervalMs);

    return () => {
      clearInterval(intervalId);
      setChecking(false);
    };
  }, [type, id, playlist, subject, gmail, intervalMs]);

  return { approved, expireAtMs, checking };
};

export default usePollApproval;