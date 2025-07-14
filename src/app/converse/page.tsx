export default function ConversePage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-center gap-4">
              <div>
                  <h1 className="text-3xl font-bold font-headline">Converse</h1>
                  <p className="text-muted-foreground">Practice your new language skills.</p>
              </div>
          </div>
      </header>
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Converse feature coming soon!</p>
      </div>
    </div>
  );
}
