import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';

interface Props {
  onLaunch: () => void;
}

export default function LaunchTile({ onLaunch }: Props) {
  return (
    <Card className="text-center launch-tile" style={{ maxWidth: 420 }}>
      <Card.Body className="p-5">
        <div className="mb-4">
          <img
            src="/assets/meta-logo-color.svg"
            alt="Meta"
            style={{ height: 64 }}
          />
        </div>
        <Card.Title as="h4" className="mb-3" style={{ fontWeight: 600 }}>
          Conversions API Connector
        </Card.Title>
        <Card.Text className="text-muted mb-4" style={{ fontSize: 15 }}>
          Set up your Meta Conversions API connector to send events from
          Databricks to Meta Ads Manager.
        </Card.Text>
        <Button variant="primary" size="lg" onClick={onLaunch}>
          <i className="fa-solid fa-bolt me-2" />
          Get Started
        </Button>
      </Card.Body>
    </Card>
  );
}
