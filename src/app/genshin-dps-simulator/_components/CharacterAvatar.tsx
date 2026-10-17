import Image from 'next/image';

type CharacterAvatarProps = {
  src?: string;
  alt: string;
  size?: number;
  'data-testid'?: string;
};

const CharacterAvatar = ({
  src,
  alt,
  size = 48,
  'data-testid': testId = 'character-avatar',
}: CharacterAvatarProps) => {
  if (!src) {
    return null;
  }

  return (
    <span
      data-testid={testId}
      className='inline-flex shrink-0 overflow-hidden rounded-full bg-linear-to-br from-amber-700 to-orange-400 ring-1 ring-amber-300/30'
    >
      <Image unoptimized src={src} alt={alt} width={size} height={size} />
    </span>
  );
};

export default CharacterAvatar;
