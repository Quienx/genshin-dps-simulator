import { ReactNode } from 'react';

type CardTitleProps = {
  title: string;
  subtitle?: string;
  media?: ReactNode;
};

const CardTitle = ({ title, subtitle, media }: CardTitleProps) => (
  <div data-testid='card-title' className='mb-4 flex items-center gap-3'>
    {media}
    <div className='min-w-0'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      <p className='text-xs text-muted-foreground'>{subtitle}</p>
    </div>
  </div>
);

export default CardTitle;
