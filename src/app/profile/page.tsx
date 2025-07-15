import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { User, BarChart, Settings, Shield } from "lucide-react"

export default function ProfilePage() {
    // In a real app, you would get this from your authentication state
    const isAdmin = true; 

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold font-headline">Profile</h1>
                        <p className="text-muted-foreground">Manage your account settings and track your progress.</p>
                    </div>
                </div>
            </header>

            <Tabs defaultValue="profile" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-4">
                    <TabsTrigger value="profile"><User className="mr-2" />My Profile</TabsTrigger>
                    <TabsTrigger value="stats"><BarChart className="mr-2" />My Stats</TabsTrigger>
                    <TabsTrigger value="settings"><Settings className="mr-2" />Settings</TabsTrigger>
                    {isAdmin && <TabsTrigger value="admin"><Shield className="mr-2" />Admin</TabsTrigger>}
                </TabsList>
                <TabsContent value="profile">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Profile</CardTitle>
                            <CardDescription>
                                This is your personal information.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex items-center justify-center h-48">
                                <p className="text-muted-foreground">Profile details coming soon!</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="stats">
                    <Card>
                        <CardHeader>
                            <CardTitle>My Stats</CardTitle>
                            <CardDescription>
                                Track your learning progress.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-center h-48">
                                <p className="text-muted-foreground">Statistics coming soon!</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Settings</CardTitle>
                            <CardDescription>
                                Manage your application settings.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="flex items-center justify-center h-48">
                                <p className="text-muted-foreground">Settings options coming soon!</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                {isAdmin && (
                    <TabsContent value="admin">
                        <Card>
                            <CardHeader>
                                <CardTitle>Admin Panel</CardTitle>
                                <CardDescription>
                                    Manage application-wide settings.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-center h-48">
                                    <p className="text-muted-foreground">Admin panel coming soon!</p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}