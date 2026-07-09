import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AddScore from "@/components/AddScore";
import AddGroupSelfie from "@/components/AddGroupSelfie";
import Scoreboard from "@/components/Scoreboard";

export default function MainPage({ admin = false }: { admin?: boolean }) {
  return (
    <div className="flex fullHeight flex-col items-center justify-between px-5 py-5 max-w-xl w-full mx-auto">
      <Tabs defaultValue="add" className="w-full gap-5 h-full grow">
        <TabsList className="w-full group-data-horizontal/tabs:h-10">
          <TabsTrigger value="add">Add Score</TabsTrigger>
          <TabsTrigger value="selfie">Selfie</TabsTrigger>
          <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
        </TabsList>
        <TabsContent value="add">
          <AddScore admin={admin} />
        </TabsContent>
        <TabsContent value="selfie">
          <AddGroupSelfie />
        </TabsContent>
        <TabsContent value="scoreboard">
          <Scoreboard admin={admin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
