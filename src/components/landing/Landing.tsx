import './landing.css';
import { AiMayMayNot } from './AiMayMayNot';
import { Faq } from './Faq';
import { Footer } from './Footer';
import { ForDirector } from './ForDirector';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { Measured } from './Measured';
import { PlanningCenter } from './PlanningCenter';
import { Privacy } from './Privacy';
import { Reveal } from './Reveal';
import { WhyItMatters } from './WhyItMatters';

/** The public landing. Static: no database, no request data; the eval numbers are read at build time. */
export function Landing({ repoUrl }: { repoUrl: string | null }) {
  return (
    <div className="lp">
      <Hero repoUrl={repoUrl} />
      <HowItWorks />
      <Privacy />
      <AiMayMayNot />
      <Measured repoUrl={repoUrl} />
      <ForDirector />
      <PlanningCenter />
      <WhyItMatters />
      <Faq />
      <Footer repoUrl={repoUrl} />
      <Reveal />
    </div>
  );
}
