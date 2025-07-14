export default function ProfilePage() {
    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Profile</h1>
                        <p className="text-muted-foreground">Manage your account settings.</p>
                    </div>
                </div>
            </header>
            <div className="flex items-center justify-center h-96">
                <p className="text-muted-foreground">Profile feature coming soon!</p>
            </div>
        </div>
    );
}
