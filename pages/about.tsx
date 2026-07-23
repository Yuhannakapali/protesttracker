import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import { STATUSES, STATUS_MEANINGS } from '@/lib/status';

export default function About() {
  return (
    <Layout title="About" description="How ProtestTracker works, and its stance of documentary neutrality.">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">About</p>
          <h1>About the archive</h1>
        </div>

        <div className="section-pad">
          <div className="about-block">
            <p>
              This archive takes no position on the movements it documents. It is not affiliated
              with any political group, party, or government, and it does not campaign, endorse, or
              editorialise. Its purpose is to preserve and organise the public record: coverage from
              many outlets, presented side by side, dated and attributed.
            </p>

            <h2>How it works</h2>
            <p>
              An automated aggregation script collects reporting on each movement from public news
              feeds, normalises and deduplicates it, and records it as a dated, attributed feed.
              Timelines, background explainers, legal trackers, and source lists are curated by hand
              and kept separate from the automated feed. Each movement is assigned one of five
              statuses, computed from the volume and recency of its coverage rather than set by
              hand.
            </p>
            <p>
              Because the data is refreshed on a schedule, the site can reflect new coverage within
              hours without any editorial judgement about what a movement means or whether it should
              succeed.
            </p>

            <h2>Status legend</h2>
            <div className="legend">
              {STATUSES.map((s) => (
                <div key={s} className="legend__row">
                  <StatusBadge status={s} />
                  <span className="meaning">{STATUS_MEANINGS[s]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
