import formatNumber from '../_lib/formatNumber';
import { toTestIdSlug } from '../_lib/labels';

type CategoryDamageRowProps = {
  category: string;
  damage: number;
  crits: number;
};

const CategoryDamageRow = ({
  category,
  damage,
  crits,
}: CategoryDamageRowProps) => (
  <div data-testid={`category-damage-row-${toTestIdSlug(category)}`}>
    <div>
      {category} DMG: {formatNumber(damage)}
    </div>
    <div>
      {category} CRITs: {crits}
    </div>
  </div>
);

export default CategoryDamageRow;
