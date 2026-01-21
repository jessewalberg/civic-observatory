import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState, useRef } from 'react'
import { motion } from 'motion/react'
import {
  Upload,
  FileText,
  Calendar,
  Building2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  X,
  FileUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { getAuth, getSignInUrl } from '@/authkit/serverFunctions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/dashboard/upload')({
  loader: async () => {
    const [auth, signInUrl] = await Promise.all([getAuth(), getSignInUrl()])
    return { auth, signInUrl }
  },
  head: () => ({
    meta: [
      { title: 'Upload Meeting | Civic Pulse' },
      { name: 'description', content: 'Upload a meeting document for AI summarization' },
    ],
  }),
  component: UploadPage,
})

const meetingTypes = [
  { value: 'city_council', label: 'City Council' },
  { value: 'school_board', label: 'School Board' },
  { value: 'planning_commission', label: 'Planning Commission' },
  { value: 'zoning_board', label: 'Zoning Board' },
  { value: 'budget_committee', label: 'Budget Committee' },
  { value: 'other', label: 'Other' },
] as const

type MeetingType = (typeof meetingTypes)[number]['value']

function UploadPage() {
  const { auth, signInUrl } = Route.useLoaderData()

  // Form state
  const [municipalityId, setMunicipalityId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [meetingType, setMeetingType] = useState<MeetingType | ''>('')
  const [meetingDate, setMeetingDate] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadMode, setUploadMode] = useState<'file' | 'paste'>('file')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Queries
  const municipalities = useQuery(api.functions.municipalities.queries.list, {
    activeOnly: true,
  })

  const usageCheck = useQuery(
    api.functions.usage.queries.checkLimit,
    auth.user ? { workosUserId: auth.user.id, action: 'meeting_upload' } : 'skip'
  )

  // Mutations
  const createMeeting = useMutation(api.functions.meetings.mutations.create)
  const recordUsage = useMutation(api.functions.usage.mutations.recordUsage)

  // Auth check
  if (!auth.user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto px-4"
        >
          <div className="rounded-full bg-primary/10 p-4 mb-4 mx-auto w-fit">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Sign in to Upload
          </h1>
          <p className="text-muted-foreground mb-6">
            You need to be signed in to upload meeting documents for summarization.
          </p>
          <a href={signInUrl}>
            <Button size="lg">Sign In</Button>
          </a>
        </motion.div>
      </div>
    )
  }

  // Usage limit check
  if (usageCheck && !usageCheck.allowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto px-4"
        >
          <div className="rounded-full bg-amber-500/10 p-4 mb-4 mx-auto w-fit">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">
            Upload Limit Reached
          </h1>
          <p className="text-muted-foreground mb-4">
            You've used all {usageCheck.limit} uploads for this month.
            {usageCheck.resetsAt && (
              <span className="block mt-2 text-sm">
                Resets on {new Date(usageCheck.resetsAt).toLocaleDateString()}
              </span>
            )}
          </p>
          <a href="/explore">
            <Button variant="outline">
              Back to Explore
            </Button>
          </a>
        </motion.div>
      </div>
    )
  }

  // File handling
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    // Validate file type
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]

    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Invalid file type. Please upload PDF, DOCX, or TXT files.')
      return
    }

    // Validate file size (10MB max)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.')
      return
    }

    setFile(selectedFile)

    // Extract text from file
    try {
      const text = await extractTextFromFile(selectedFile)
      setContent(text)
    } catch (error) {
      toast.error('Failed to extract text from file')
      console.error('Text extraction error:', error)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      const input = fileInputRef.current
      if (input) {
        const dt = new DataTransfer()
        dt.items.add(droppedFile)
        input.files = dt.files
        handleFileChange({ target: input } as React.ChangeEvent<HTMLInputElement>)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!municipalityId || !title || !meetingType || !meetingDate || !content) {
      toast.error('Please fill in all required fields')
      return
    }

    if (content.length < 100) {
      toast.error('Content is too short. Please provide more text.')
      return
    }

    if (content.length > 50000) {
      toast.error('Content is too long. Maximum is 50,000 characters.')
      return
    }

    setIsSubmitting(true)

    try {
      const meetingId = await createMeeting({
        municipalityId: municipalityId as Id<'municipalities'>,
        title,
        meetingType: meetingType as MeetingType,
        meetingDate: new Date(meetingDate).getTime(),
        rawContent: content,
        workosUserId: auth.user!.id,
      })

      // Record usage
      await recordUsage({
        workosUserId: auth.user!.id,
        action: 'meeting_upload',
        windowType: 'month',
      })

      toast.success('Meeting uploaded successfully!')
      // Use window.location for navigation until route tree is regenerated
      window.location.href = `/meeting/${meetingId}`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload meeting'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const clearFile = () => {
    setFile(null)
    setContent('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="rounded-full bg-primary/10 p-3 mb-4 mx-auto w-fit">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground mb-2">
              Upload Meeting
            </h1>
            <p className="text-muted-foreground">
              Upload a meeting document and we'll generate an AI summary.
            </p>
            {usageCheck && usageCheck.limit !== -1 && (
              <p className="text-sm text-muted-foreground mt-2">
                {usageCheck.remaining} of {usageCheck.limit} uploads remaining this month
              </p>
            )}
          </div>

          {/* Form */}
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Municipality */}
              <div className="space-y-2">
                <Label htmlFor="municipality" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Municipality *
                </Label>
                <Select value={municipalityId} onValueChange={setMunicipalityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a municipality" />
                  </SelectTrigger>
                  <SelectContent>
                    {municipalities?.map((muni) => (
                      <SelectItem key={muni._id} value={muni._id}>
                        {muni.name}, {muni.state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Meeting Title *
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., City Council Regular Meeting"
                />
              </div>

              {/* Type and Date row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Meeting Type */}
                <div className="space-y-2">
                  <Label htmlFor="meetingType">Meeting Type *</Label>
                  <Select value={meetingType} onValueChange={(v) => setMeetingType(v as MeetingType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {meetingTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Meeting Date */}
                <div className="space-y-2">
                  <Label htmlFor="meetingDate" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date *
                  </Label>
                  <Input
                    id="meetingDate"
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Content Input Mode Toggle */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label>Meeting Content *</Label>
                  <div className="flex bg-muted rounded-lg p-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => setUploadMode('file')}
                      className={cn(
                        'px-3 py-1 text-sm rounded-md transition-colors',
                        uploadMode === 'file'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('paste')}
                      className={cn(
                        'px-3 py-1 text-sm rounded-md transition-colors',
                        uploadMode === 'paste'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Paste Text
                    </button>
                  </div>
                </div>

                {uploadMode === 'file' ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className={cn(
                      'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                      file
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                    />

                    {file ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        <span className="text-foreground">{file.name}</span>
                        <button
                          type="button"
                          onClick={clearFile}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <FileUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-foreground mb-1">
                          Drop a file here or click to upload
                        </p>
                        <p className="text-sm text-muted-foreground">
                          PDF, DOCX, or TXT (max 10MB)
                        </p>
                      </label>
                    )}
                  </div>
                ) : (
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste the meeting minutes or transcript here..."
                    className="min-h-[200px] font-mono text-sm"
                  />
                )}

                {content && (
                  <p className="text-sm text-muted-foreground">
                    {content.length.toLocaleString()} characters
                    {content.length < 100 && (
                      <span className="text-amber-500"> (minimum 100 required)</span>
                    )}
                    {content.length > 50000 && (
                      <span className="text-red-500"> (maximum 50,000 exceeded)</span>
                    )}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting || !municipalityId || !title || !meetingType || !meetingDate || !content}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Meeting
                  </>
                )}
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Text extraction utilities
// ═══════════════════════════════════════════════════════════════
async function extractTextFromFile(file: File): Promise<string> {
  const type = file.type

  if (type === 'text/plain') {
    return await file.text()
  }

  if (type === 'application/pdf') {
    return await extractTextFromPDF(file)
  }

  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return await extractTextFromDOCX(file)
  }

  throw new Error('Unsupported file type')
}

async function extractTextFromPDF(file: File): Promise<string> {
  // Use PDF.js for client-side PDF text extraction
  // For now, we'll use a simpler approach with FileReader
  // In production, you'd want to use pdf.js or send to server

  // Try to extract text using the browser's PDF capabilities
  // This is a placeholder - proper PDF extraction requires pdf.js
  const text = await file.text()

  // If we get actual text content (some PDFs have embedded text)
  if (text && text.length > 100 && !text.includes('%PDF')) {
    return text
  }

  // For now, throw an error suggesting text paste
  throw new Error(
    'PDF text extraction requires additional setup. Please paste the text content directly or use a TXT file.'
  )
}

async function extractTextFromDOCX(file: File): Promise<string> {
  // DOCX files are ZIP archives containing XML
  // For proper extraction, you'd use a library like mammoth.js
  // For now, we'll provide a fallback

  try {
    // Try using the File System Access API if available
    const arrayBuffer = await file.arrayBuffer()

    // DOCX is a ZIP file - we can try to extract the XML content
    // This is a simplified approach that works for basic DOCX files
    const decoder = new TextDecoder('utf-8')
    const content = decoder.decode(arrayBuffer)

    // Look for text content in the XML
    const textMatches = content.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)
    if (textMatches) {
      const text = textMatches
        .map((match) => match.replace(/<[^>]+>/g, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (text.length > 100) {
        return text
      }
    }
  } catch {
    // Extraction failed
  }

  throw new Error(
    'DOCX text extraction requires additional setup. Please paste the text content directly or use a TXT file.'
  )
}
