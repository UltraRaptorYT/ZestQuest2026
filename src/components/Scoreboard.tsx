export default function Scoreboard({ admin = false }: { admin?: boolean }) {
  return <div>Scoreboard {admin.toString()}</div>;
}
