interface RiskHeaderProps {
  title: string;
  description: string;
}

export default function RiskHeader({ title, description }: RiskHeaderProps) {
  return (
    <section className="card risk-hero">
      <div>
        <div className="risk-kicker">风险中心</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
