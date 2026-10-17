import { ReactNode } from 'react';

import SkillSection from '../SkillSection';

type SkillPassivesProps = {
  title: string;
  children: ReactNode;
  'data-testid'?: string;
};

const SkillPassives = ({
  title,
  children,
  'data-testid': testId = 'skills-card-passives',
}: SkillPassivesProps) => (
  <SkillSection data-testid={testId} title={title}>
    <ul data-testid={`${testId}-rows`} className='mt-3 space-y-2'>
      {children}
    </ul>
  </SkillSection>
);

export default SkillPassives;
