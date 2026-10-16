export default function AppSelect({ apps, value, onChange, label = 'Application' }) {
  return (
    <>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {apps.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </>
  );
}
