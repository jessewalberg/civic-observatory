import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState, useMemo } from 'react'
import { Search, MapPin, Building2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { api } from '../../../convex/_generated/api'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  MunicipalityCard,
  MunicipalityCardSkeleton,
} from '@/components/MunicipalityCard'

export const Route = createFileRoute('/explore/')({
  component: ExplorePage,
})

// US States for filter dropdown
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
]

function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedState, setSelectedState] = useState<string>('')

  // Fetch municipalities - use search if query exists, otherwise list
  const searchResults = useQuery(
    api.functions.municipalities.queries.search,
    searchQuery.trim() ? { query: searchQuery, limit: 50 } : 'skip'
  )

  const listResults = useQuery(
    api.functions.municipalities.queries.list,
    !searchQuery.trim()
      ? { state: selectedState || undefined, activeOnly: true }
      : 'skip'
  )

  // Fetch meeting counts for each municipality
  const municipalitiesWithStats = useQuery(
    api.functions.municipalities.queries.listByState,
    { activeOnly: true }
  )

  // Create a map of municipality ID to meeting count
  const meetingCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    // We'll use getStats for each, but for now just show 0
    // In a real app, you'd batch this or include in the list query
    return counts
  }, [])

  // Determine which results to show
  const municipalities = searchQuery.trim() ? searchResults : listResults
  const isLoading = municipalities === undefined

  // Filter search results by state if both search and state filter active
  const filteredMunicipalities = useMemo(() => {
    if (!municipalities) return []
    if (searchQuery.trim() && selectedState) {
      return municipalities.filter((m) => m.state === selectedState)
    }
    return municipalities
  }, [municipalities, searchQuery, selectedState])

  // Get unique states from results for showing active filters
  const availableStates = useMemo(() => {
    if (!municipalitiesWithStats) return []
    return municipalitiesWithStats.map((group) => group.state).sort()
  }, [municipalitiesWithStats])

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedState('')
  }

  const hasActiveFilters = searchQuery.trim() || selectedState

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface/50">
        <div className="container mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <h1 className="font-display text-4xl font-bold text-foreground mb-3">
              Explore Municipalities
            </h1>
            <p className="text-lg text-muted-foreground">
              Browse local government meetings from cities and towns across the
              country. Search by name or filter by state.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search municipalities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* State Filter */}
            <Select
              value={selectedState || 'all'}
              onValueChange={(value) =>
                setSelectedState(value === 'all' ? '' : value)
              }
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {(availableStates.length > 0 ? availableStates : US_STATES).map(
                  (state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            {/* Clear Filters */}
            <AnimatePresence>
              {hasActiveFilters && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-10"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-8">
        {/* Results count */}
        {!isLoading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-muted-foreground mb-6"
          >
            {filteredMunicipalities.length}{' '}
            {filteredMunicipalities.length === 1
              ? 'municipality'
              : 'municipalities'}{' '}
            found
            {selectedState && ` in ${selectedState}`}
            {searchQuery.trim() && ` matching "${searchQuery}"`}
          </motion.p>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MunicipalityCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredMunicipalities.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="rounded-full bg-muted p-4 mb-4">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold text-foreground mb-2">
              No municipalities found
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              {searchQuery.trim()
                ? `We couldn't find any municipalities matching "${searchQuery}".`
                : selectedState
                  ? `No municipalities are available in ${selectedState} yet.`
                  : 'No municipalities are available yet.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </motion.div>
        )}

        {/* Municipality Grid */}
        {!isLoading && filteredMunicipalities.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {filteredMunicipalities.map((municipality, index) => (
              <motion.div
                key={municipality._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
              >
                <MunicipalityCard
                  id={municipality._id}
                  name={municipality.name}
                  state={municipality.state}
                  county={municipality.county}
                  population={municipality.population}
                  isVerified={municipality.isVerified}
                  meetingCount={meetingCounts[municipality._id] ?? 0}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
