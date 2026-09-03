import Layout from '@/components/Layout';
import StatusBadge from '@/components/StatusBadge';
import { STATUSES, STATUS_MEANINGS } from '@/lib/status';

export default function About() {
  return (
    <Layout
      title="About"
      description="How ProtestTracker compiles its archive: which sources are aggregated, how movement status is decided, and why the record is kept neutral."
      path="/about/"
    >
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

            <h2>How coverage is gathered</h2>
            <p>
              Every movement has a set of news feeds behind it: topic searches on Google News plus
              the feeds of publishers that cover the story directly. An aggregation script runs
              every two hours, reads each feed, and keeps only items matching that movement&rsquo;s
              keyword list. Feeds belonging to a single publisher are held to a stricter list than
              topic searches are, because a publisher&rsquo;s site-wide feed carries everything they
              write, not only the story being tracked.
            </p>
            <p>
              Matching items are stripped of markup, deduplicated by URL and by near-identical
              headline, and stored newest first with their source, date and — where the publisher
              provides one — an opening extract. The most recent 250 stay in the live feed; older
              records move into a per-movement archive that loads on request. Nothing is deleted
              once logged.
            </p>

            <h2>How status is decided</h2>
            <p>
              Status is computed from the timing of a movement&rsquo;s own coverage, not assigned by
              anyone. A sharp rise concentrated in the last 48 hours reads as escalating; any
              coverage in the last week reads as active; coverage in the last month but not the last
              week reads as quiet; anything older reads as dormant. Concluded is the one status set
              by hand, because a bill withdrawn or a policy reversed is an outcome no article count
              can infer.
            </p>

            <h2>What is written rather than aggregated</h2>
            <p>
              Four things on a movement page are curated: the summary and questions at the top, the
              timeline, the background explainer, and the legal tracker. Everything else — the
              coverage chart, the outlet list, the article feed, the counts — is derived from the
              stored articles and changes on its own. The two are kept separate deliberately, so it
              stays clear which parts of a page reflect judgement and which reflect the record.
            </p>

            <h2>Corrections</h2>
            <p>
              This site holds no original reporting. Where an aggregated article is wrong, the
              correction belongs with the publisher, and their link is on every entry. Where this
              site is wrong — a mischaracterised movement, a wrongly filed article, a broken or
              misattributed link, an error in a curated section — the record here is what needs
              fixing. Corrections are made to the underlying data rather than noted alongside it,
              and the aggregation history is public in the repository, so what changed and when
              remains inspectable.
            </p>

            <h2>Limits worth knowing</h2>
            <p>
              Coverage is only as broad as the feeds behind it, which skew toward English-language
              and online-first outlets, and a movement receiving little press will look quieter here
              than it is on the ground. Keyword filters admit the occasional unrelated article and
              exclude the occasional relevant one. Article counts measure how much was written, not
              how many people marched.
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
