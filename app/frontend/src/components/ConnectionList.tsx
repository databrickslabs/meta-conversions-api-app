import ListGroup from 'react-bootstrap/ListGroup';
import Button from 'react-bootstrap/Button';
import type { SavedConnection } from '../App';

interface Props {
  connections: SavedConnection[];
  onDelete: (id: string) => void;
  onSelect: (conn: SavedConnection) => void;
}

export default function ConnectionList({ connections, onDelete, onSelect }: Props) {
  return (
    <div className="w-100">
      <h6 className="mb-3" style={{ fontWeight: 600, color: 'var(--meta-text)' }}>
        Existing Connections
      </h6>
      <ListGroup variant="flush">
        {connections.map(conn => (
          <ListGroup.Item
            key={conn.id}
            action
            onClick={() => onSelect(conn)}
            className="d-flex justify-content-between align-items-center px-3 py-2"
            style={{ background: 'var(--meta-bg)', border: '1px solid var(--meta-border)', borderRadius: 6, marginBottom: 8, cursor: 'pointer' }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>
                <i className="fa-brands fa-meta me-2" style={{ color: 'var(--meta-blue)' }} />
                Pixel {conn.pixelId}
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                Created {new Date(conn.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <Button
                variant="outline-danger"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(conn.id); }}
                title="Remove connection"
              >
                <i className="fa-solid fa-trash" style={{ fontSize: 11 }} />
              </Button>
            </div>
          </ListGroup.Item>
        ))}
      </ListGroup>
    </div>
  );
}
