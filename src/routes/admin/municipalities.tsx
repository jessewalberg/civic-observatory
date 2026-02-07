import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from 'convex/react'
import { useState } from 'react'
import { motion } from 'motion/react'
import {
  Building2,
  Edit,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Shield,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { getAuth, getSignInUrl } from '@/authkit/serverFunctions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/admin/municipalities')({
  loader: async () => {
    const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()])
    return { auth, signInUrl }
  },
  head: () => ({
    meta: [
      { title: 'Manage Municipalities | Civic Pulse Admin' },
      { name: 'description', content: 'Add and manage municipalities' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: MunicipalitiesAdminPage,
})

type Platform = 'granicus' | 'civicplus' | 'generic' | 'manual'

interface MunicipalityFormData {
  name: string
  state: string
  county: string
  population: string
  timezone: string
  websiteUrl: string
  meetingsPageUrl: string
  platform: Platform
  frequencyHours: string
  isActive: boolean
  isVerified: boolean
}

const initialFormData: MunicipalityFormData = {
  name: '',
  state: '',
  county: '',
  population: '',
  timezone: 'America/New_York',
  websiteUrl: '',
  meetingsPageUrl: '',
  platform: 'manual',
  frequencyHours: '24',
  isActive: true,
  isVerified: false,
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

function MunicipalitiesAdminPage() {
  const { auth, signInUrl } = Route.useLoaderData()

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
            Please sign in to manage municipalities.
          </p>
          <a href={signInUrl}>
            <Button size="lg">Sign In</Button>
          </a>
        </motion.div>
      </div>
    )
  }

  return <MunicipalitiesContent workosUserId={auth.user.id} />
}

function MunicipalitiesContent({ workosUserId }: { workosUserId: string }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [editingId, setEditingId] = useState<Id<'municipalities'> | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<Id<'municipalities'> | null>(null)
  const [formData, setFormData] = useState<MunicipalityFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Queries
  const isAdmin = useQuery(api.functions.users.queries.isAdmin, { workosUserId })
  const municipalities = useQuery(api.functions.municipalities.queries.list, {})

  // Mutations
  const createMunicipality = useMutation(api.functions.municipalities.mutations.create)
  const updateMunicipality = useMutation(api.functions.municipalities.mutations.update)
  const deleteMunicipality = useMutation(api.functions.municipalities.mutations.remove)
  const toggleActive = useMutation(api.functions.municipalities.mutations.toggleActive)
  const verifyMunicipality = useMutation(api.functions.municipalities.mutations.verify)

  const isLoading = isAdmin === undefined || municipalities === undefined

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
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
    )
  }

  // Filter municipalities
  const filteredMunicipalities = municipalities?.filter((m) => {
    const matchesSearch =
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.state.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesPlatform =
      filterPlatform === 'all' || m.platform === filterPlatform
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && m.isActive) ||
      (filterStatus === 'inactive' && !m.isActive) ||
      (filterStatus === 'verified' && m.isVerified)
    return matchesSearch && matchesPlatform && matchesStatus
  })

  const handleCreate = async () => {
    if (!formData.name || !formData.state) {
      toast.error('Name and state are required')
      return
    }

    setIsSubmitting(true)
    try {
      await createMunicipality({
        name: formData.name,
        state: formData.state,
        county: formData.county || undefined,
        population: formData.population ? parseInt(formData.population) : undefined,
        timezone: formData.timezone || undefined,
        websiteUrl: formData.websiteUrl || undefined,
        meetingsPageUrl: formData.meetingsPageUrl || undefined,
        platform: formData.platform,
        scrapeConfig: formData.platform !== 'manual' ? {
          frequencyHours: parseInt(formData.frequencyHours) || 24,
        } : undefined,
        isActive: formData.isActive,
        isVerified: formData.isVerified,
      })
      toast.success('Municipality created')
      setIsCreateOpen(false)
      setFormData(initialFormData)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingId || !formData.name || !formData.state) {
      toast.error('Name and state are required')
      return
    }

    setIsSubmitting(true)
    try {
      await updateMunicipality({
        id: editingId,
        name: formData.name,
        state: formData.state,
        county: formData.county || undefined,
        population: formData.population ? parseInt(formData.population) : undefined,
        timezone: formData.timezone || undefined,
        websiteUrl: formData.websiteUrl || undefined,
        meetingsPageUrl: formData.meetingsPageUrl || undefined,
        platform: formData.platform,
        scrapeConfig: formData.platform !== 'manual' ? {
          frequencyHours: parseInt(formData.frequencyHours) || 24,
        } : undefined,
        isActive: formData.isActive,
        isVerified: formData.isVerified,
      })
      toast.success('Municipality updated')
      setEditingId(null)
      setFormData(initialFormData)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return

    setIsSubmitting(true)
    try {
      await deleteMunicipality({ id: deleteConfirmId })
      toast.success('Municipality deleted')
      setDeleteConfirmId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleActive = async (id: Id<'municipalities'>) => {
    try {
      await toggleActive({ id })
      toast.success('Status updated')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update'
      toast.error(message)
    }
  }

  const handleToggleVerified = async (id: Id<'municipalities'>, verified: boolean) => {
    try {
      await verifyMunicipality({ id, verified: !verified })
      toast.success('Verification updated')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update'
      toast.error(message)
    }
  }

  const openEdit = (muni: NonNullable<typeof municipalities>[0]) => {
    setFormData({
      name: muni.name,
      state: muni.state,
      county: muni.county ?? '',
      population: muni.population?.toString() ?? '',
      timezone: muni.timezone ?? 'America/New_York',
      websiteUrl: muni.websiteUrl ?? '',
      meetingsPageUrl: muni.meetingsPageUrl ?? '',
      platform: muni.platform,
      frequencyHours: muni.scrapeConfig?.frequencyHours?.toString() ?? '24',
      isActive: muni.isActive,
      isVerified: muni.isVerified,
    })
    setEditingId(muni._id)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link to="/admin">
                  <Button variant="ghost" size="sm">
                    ← Admin
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <h1 className="font-display text-3xl font-bold text-foreground">
                  Municipalities
                </h1>
              </div>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Municipality
            </Button>
          </div>

          {/* Filters */}
          <Card className="p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or state..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="granicus">Granicus</SelectItem>
                  <SelectItem value="civicplus">CivicPlus</SelectItem>
                  <SelectItem value="generic">Generic</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-2xl font-bold text-foreground">
                {municipalities?.length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Total</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-emerald-400">
                {municipalities?.filter((m) => m.isActive).length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Active</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-blue-400">
                {municipalities?.filter((m) => m.isVerified).length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Verified</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-amber-400">
                {filteredMunicipalities?.length ?? 0}
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
                    <TableHead>Name</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Scraped</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMunicipalities?.map((muni) => (
                    <TableRow key={muni._id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {muni.name}
                          </span>
                          {muni.county && (
                            <span className="text-xs text-muted-foreground">
                              {muni.county} County
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{muni.state}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {muni.platform}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={muni.isActive ? 'success' : 'secondary'}
                            className="text-xs cursor-pointer"
                            onClick={() => handleToggleActive(muni._id)}
                          >
                            {muni.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          {muni.isVerified && (
                            <Badge
                              variant="info"
                              className="text-xs cursor-pointer"
                              onClick={() => handleToggleVerified(muni._id, muni.isVerified)}
                            >
                              Verified
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {muni.lastScrapedAt
                          ? formatRelativeTime(muni.lastScrapedAt)
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {muni.websiteUrl && (
                            <a
                              href={muni.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(muni)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(muni._id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!filteredMunicipalities || filteredMunicipalities.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No municipalities found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isCreateOpen || editingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setEditingId(null)
            setFormData(initialFormData)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Municipality' : 'Add Municipality'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the municipality details.'
                : 'Add a new municipality to track.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="City of Example"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) =>
                    setFormData((f) => ({ ...f, state: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="county">County</Label>
                <Input
                  id="county"
                  value={formData.county}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, county: e.target.value }))
                  }
                  placeholder="Example County"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="population">Population</Label>
                <Input
                  id="population"
                  type="number"
                  value={formData.population}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, population: e.target.value }))
                  }
                  placeholder="50000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(value) =>
                    setFormData((f) => ({ ...f, timezone: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace('America/', '').replace('Pacific/', '')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform">Platform *</Label>
                <Select
                  value={formData.platform}
                  onValueChange={(value: Platform) =>
                    setFormData((f) => ({ ...f, platform: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="granicus">Granicus</SelectItem>
                    <SelectItem value="civicplus">CivicPlus</SelectItem>
                    <SelectItem value="generic">Generic</SelectItem>
                    <SelectItem value="manual">Manual Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                type="url"
                value={formData.websiteUrl}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, websiteUrl: e.target.value }))
                }
                placeholder="https://www.example.gov"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meetingsPageUrl">Meetings Page URL</Label>
              <Input
                id="meetingsPageUrl"
                type="url"
                value={formData.meetingsPageUrl}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, meetingsPageUrl: e.target.value }))
                }
                placeholder="https://www.example.gov/meetings"
              />
            </div>

            {formData.platform !== 'manual' && (
              <div className="space-y-2">
                <Label htmlFor="frequencyHours">Scrape Frequency (hours)</Label>
                <Input
                  id="frequencyHours"
                  type="number"
                  value={formData.frequencyHours}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, frequencyHours: e.target.value }))
                  }
                  placeholder="24"
                />
              </div>
            )}

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, isActive: e.target.checked }))
                  }
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isVerified}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, isVerified: e.target.checked }))
                  }
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">Verified</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false)
                setEditingId(null)
                setFormData(initialFormData)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Municipality</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this municipality? This action cannot
              be undone. If this municipality has meetings, you must deactivate it
              instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}
