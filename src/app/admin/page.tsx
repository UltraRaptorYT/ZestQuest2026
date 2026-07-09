import MainPage from "@/components/MainPage";

export default function Home() {
  return (
    <>
      <div className="left-2 top-2 fixed">Admin View</div>
      <MainPage admin={true} />
    </>
  );
}
