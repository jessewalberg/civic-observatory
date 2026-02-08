import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	Crown,
	Loader2,
	Search,
	Shield,
	ShieldCheck,
	User,
	Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { getAuth, getSignInUrl } from "@/authkit/serverFunctions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export const Route = createFileRoute("/admin/users")({
	loader: async () => {
		const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()]);
		return { auth, signInUrl };
	},
	head: () => ({
		meta: [
			{ title: "Manage Users | Civic Pulse Admin" },
			{ name: "description", content: "User management and administration" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: UsersAdminPage,
});

function UsersAdminPage() {
	const { auth, signInUrl } = Route.useLoaderData();

	if (!auth.user) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center max-w-md mx-auto px-4"
				>
					<div className="rounded-full bg-primary/10 p-4 mb-4 mx-auto w-fit">
						<Shield className="h-8 w-8 text-primary" />
					</div>
					<h1 className="font-display text-2xl font-bold text-foreground mb-2">
						Admin Access Required
					</h1>
					<p className="text-muted-foreground mb-6">
						Please sign in to manage users.
					</p>
					<a href={signInUrl}>
						<Button size="lg">Sign In</Button>
					</a>
				</motion.div>
			</div>
		);
	}

	return <UsersContent workosUserId={auth.user.id} />;
}

function UsersContent({ workosUserId }: { workosUserId: string }) {
	const formId = useId();
	const [searchQuery, setSearchQuery] = useState("");
	const [filterTier, setFilterTier] = useState<string>("all");
	const [filterRole, setFilterRole] = useState<string>("all");
	const [editingUser, setEditingUser] = useState<{
		id: Id<"users">;
		email: string;
		name?: string;
		tier: "free" | "pro";
		isAdmin: boolean;
	} | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Queries
	const isAdmin = useQuery(api.functions.users.queries.isAdmin, {
		workosUserId,
	});
	const usersResult = useQuery(api.functions.users.queries.listAll, {
		requestingWorkosUserId: workosUserId,
		limit: 500,
	});
	const stats = useQuery(api.functions.users.queries.getAdminStats, {
		requestingWorkosUserId: workosUserId,
	});

	// Handle the paginated users result
	const users = Array.isArray(usersResult)
		? usersResult
		: usersResult?.users ?? [];

	// Mutations
	const adminUpdateUser = useMutation(
		api.functions.users.mutations.adminUpdateUser,
	);

	const isLoading = isAdmin === undefined || usersResult === undefined;

	if (isLoading) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
			</div>
		);
	}

	if (!isAdmin) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-center max-w-md mx-auto px-4"
				>
					<div className="rounded-full bg-red-500/10 p-4 mb-4 mx-auto w-fit">
						<Shield className="h-8 w-8 text-red-400" />
					</div>
					<h1 className="font-display text-2xl font-bold text-foreground mb-2">
						Access Denied
					</h1>
					<p className="text-muted-foreground mb-6">
						You do not have admin privileges.
					</p>
					<Link to="/">
						<Button variant="outline">Return Home</Button>
					</Link>
				</motion.div>
			</div>
		);
	}

	// Filter users
	const filteredUsers = users?.filter((u) => {
		const matchesSearch =
			!searchQuery ||
			u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
			u.name?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesTier = filterTier === "all" || u.tier === filterTier;
		const matchesRole =
			filterRole === "all" ||
			(filterRole === "admin" && u.isAdmin) ||
			(filterRole === "user" && !u.isAdmin);
		return matchesSearch && matchesTier && matchesRole;
	});

	const handleUpdateUser = async () => {
		if (!editingUser) return;

		setIsSubmitting(true);
		try {
			await adminUpdateUser({
				userId: editingUser.id,
				tier: editingUser.tier,
				isAdmin: editingUser.isAdmin,
				requestingWorkosUserId: workosUserId,
			});
			toast.success("User updated");
			setEditingUser(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const quickSetTier = async (userId: Id<"users">, tier: "free" | "pro") => {
		try {
			await adminUpdateUser({
				userId,
				tier,
				requestingWorkosUserId: workosUserId,
			});
			toast.success(`User set to ${tier}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update";
			toast.error(message);
		}
	};

	const quickToggleAdmin = async (
		userId: Id<"users">,
		currentIsAdmin: boolean,
	) => {
		try {
			await adminUpdateUser({
				userId,
				isAdmin: !currentIsAdmin,
				requestingWorkosUserId: workosUserId,
			});
			toast.success(currentIsAdmin ? "Admin removed" : "Admin granted");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update";
			toast.error(message);
		}
	};

	return (
		<div className="min-h-screen bg-background">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					{/* Header */}
					<div className="mb-8">
						<div className="flex items-center gap-3 mb-2">
							<Link to="/admin">
								<Button variant="ghost" size="sm">
									← Admin
								</Button>
							</Link>
						</div>
						<div className="flex items-center gap-3">
							<div className="rounded-full bg-primary/10 p-2">
								<Users className="h-5 w-5 text-primary" />
							</div>
							<h1 className="font-display text-3xl font-bold text-foreground">
								User Management
							</h1>
						</div>
					</div>

					{/* Filters */}
					<Card className="p-4 mb-6">
						<div className="flex flex-col sm:flex-row gap-4">
							<div className="flex-1">
								<div className="relative">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search by email or name..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-10"
									/>
								</div>
							</div>
							<Select value={filterTier} onValueChange={setFilterTier}>
								<SelectTrigger className="w-[130px]">
									<SelectValue placeholder="Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Tiers</SelectItem>
									<SelectItem value="free">Free</SelectItem>
									<SelectItem value="pro">Pro</SelectItem>
								</SelectContent>
							</Select>
							<Select value={filterRole} onValueChange={setFilterRole}>
								<SelectTrigger className="w-[130px]">
									<SelectValue placeholder="Role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Roles</SelectItem>
									<SelectItem value="admin">Admins</SelectItem>
									<SelectItem value="user">Users</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</Card>

					{/* Stats */}
					<div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
						<Card className="p-4">
							<p className="text-2xl font-bold text-foreground">
								{stats?.totalUsers ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">Total Users</p>
						</Card>
						<Card className="p-4">
							<p className="text-2xl font-bold text-blue-400">
								{stats?.freeUsers ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">Free</p>
						</Card>
						<Card className="p-4">
							<p className="text-2xl font-bold text-emerald-400">
								{stats?.proUsers ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">Pro</p>
						</Card>
						<Card className="p-4">
							<p className="text-2xl font-bold text-amber-400">
								{stats?.adminUsers ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">Admins</p>
						</Card>
						<Card className="p-4">
							<p className="text-2xl font-bold text-purple-400">
								{filteredUsers?.length ?? 0}
							</p>
							<p className="text-xs text-muted-foreground">Showing</p>
						</Card>
					</div>

					{/* Table */}
					<Card>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>User</TableHead>
										<TableHead>Tier</TableHead>
										<TableHead>Role</TableHead>
										<TableHead>Joined</TableHead>
										<TableHead>Last Login</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredUsers?.map((user) => (
										<TableRow key={user._id}>
											<TableCell>
												<div className="flex items-center gap-3">
													{user.avatarUrl ? (
														<img
															src={user.avatarUrl}
															alt={user.name ?? user.email}
															className="w-8 h-8 rounded-full"
														/>
													) : (
														<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
															<User className="h-4 w-4 text-muted-foreground" />
														</div>
													)}
													<div className="flex flex-col">
														<span className="font-medium text-foreground">
															{user.name ?? "No name"}
														</span>
														<span className="text-xs text-muted-foreground">
															{user.email}
														</span>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														user.tier === "pro" ? "success" : "secondary"
													}
													className="text-xs cursor-pointer"
													onClick={() =>
														quickSetTier(
															user._id,
															user.tier === "pro" ? "free" : "pro",
														)
													}
												>
													{user.tier === "pro" && (
														<Crown className="h-3 w-3 mr-1" />
													)}
													{user.tier}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge
													variant={user.isAdmin ? "warning" : "outline"}
													className="text-xs cursor-pointer"
													onClick={() =>
														quickToggleAdmin(user._id, user.isAdmin === true)
													}
												>
													{user.isAdmin ? (
														<>
															<ShieldCheck className="h-3 w-3 mr-1" />
															Admin
														</>
													) : (
														"User"
													)}
												</Badge>
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{formatDate(user.createdAt)}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{formatRelativeTime(user.lastLoginAt)}
											</TableCell>
											<TableCell className="text-right">
												<div className="flex items-center justify-end gap-2">
													<Button
														variant="ghost"
														size="sm"
														onClick={() =>
															setEditingUser({
																id: user._id,
																email: user.email,
																name: user.name,
																tier: user.tier,
																isAdmin: user.isAdmin === true,
															})
														}
													>
														Edit
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
									{(!filteredUsers || filteredUsers.length === 0) && (
										<TableRow>
											<TableCell
												colSpan={6}
												className="text-center py-8 text-muted-foreground"
											>
												No users found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
					</Card>
				</motion.div>
			</div>

			{/* Edit User Dialog */}
			<Dialog
				open={editingUser !== null}
				onOpenChange={(open) => !open && setEditingUser(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit User</DialogTitle>
						<DialogDescription>
							Update user tier and admin status for {editingUser?.email}
						</DialogDescription>
					</DialogHeader>

					{editingUser && (
						<div className="space-y-4 py-4">
							<div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
								<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
									<User className="h-5 w-5 text-muted-foreground" />
								</div>
								<div>
									<p className="font-medium text-foreground">
										{editingUser.name ?? "No name"}
									</p>
									<p className="text-sm text-muted-foreground">
										{editingUser.email}
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor={`${formId}-tier`}>Tier</Label>
								<Select
									value={editingUser.tier}
									onValueChange={(value: "free" | "pro") =>
										setEditingUser((u) => (u ? { ...u, tier: value } : null))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="free">Free</SelectItem>
										<SelectItem value="pro">Pro</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id={`${formId}-isAdmin`}
									checked={editingUser.isAdmin}
									onChange={(e) =>
										setEditingUser((u) =>
											u ? { ...u, isAdmin: e.target.checked } : null,
										)
									}
									className="rounded border-border"
								/>
								<label
									htmlFor={`${formId}-isAdmin`}
									className="text-sm text-foreground cursor-pointer"
								>
									Admin privileges
								</label>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => setEditingUser(null)}>
							Cancel
						</Button>
						<Button onClick={handleUpdateUser} disabled={isSubmitting}>
							{isSubmitting && (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							)}
							Save Changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	if (diff < 60000) return "just now";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
	return formatDate(timestamp);
}
