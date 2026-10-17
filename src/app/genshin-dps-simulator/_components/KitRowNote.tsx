type KitRowNoteProps = {
  note?: string;
};

const KitRowNote = ({ note }: KitRowNoteProps) => {
  if (!note) {
    return null;
  }
  return (
    <p data-testid='kit-row-note' className='text-xs text-muted-foreground'>
      {note}
    </p>
  );
};

export default KitRowNote;
