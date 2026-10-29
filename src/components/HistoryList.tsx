import type { Job } from '../lib/api';

export function HistoryList({ jobs }: { jobs: Job[] }) {
  return (
    <section className="glass card">
      <h2>Recent downloads</h2>
      {jobs.length === 0 ? (
        <p className="muted">No downloads yet.</p>
      ) : (
        <ul className="history">
          {jobs.map((job) => (
            <li key={job.id} className="spaced">
              <span>
                <b>{job.title}</b>
                <br />
                <small className="muted">
                  {job.site} · {job.status}
                </small>
              </span>
              {job.has_file ? (
                <a
                  className="btn subtle"
                  href={`/api/jobs/${job.id}/file`}
                  download
                >
                  Save again
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
