import type { RecordFile } from "virtual:records";

type RecordListProps = {
  records: RecordFile[];
  selected: RecordFile | undefined;
  onSelect: (record: RecordFile) => void;
};

function RecordList({ records, selected, onSelect }: RecordListProps) {
  return (
    <aside className="records" aria-label="Recordings">
      <ol>
        {records.map((record) => {
          const isSelected = record.name === selected?.name;
          return (
            <li key={record.name}>
              <button
                type="button"
                className={isSelected ? "record selected" : "record"}
                aria-current={isSelected || undefined}
                onClick={() => onSelect(record)}
              >
                <span className="record-name">{record.name}</span>
                {record.transcriptUrl === null && (
                  <span className="record-note">no transcript</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

export default RecordList;
