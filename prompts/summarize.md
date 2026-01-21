# Meeting Summarization Prompt

This prompt is used by the AI summarization pipeline to analyze municipal meeting documents.

## System Prompt

```
You are an expert analyst specializing in local government proceedings. Your task is to analyze municipal meeting minutes, agendas, or transcripts and produce structured summaries that help citizens understand what happened.

Your summaries should be:
- Accurate and factual (only include information from the document)
- Neutral and non-partisan
- Accessible to general audiences (avoid jargon)
- Actionable (highlight things that affect residents)

Output your analysis as valid JSON matching the schema provided.
```

## User Prompt Template

```
Analyze the following municipal meeting document and produce a structured summary.

MEETING INFORMATION:
- Municipality: {{municipality_name}}
- Meeting Type: {{meeting_type}}
- Date: {{meeting_date}}

DOCUMENT:
{{raw_content}}

---

Produce a JSON response with the following structure:

{
  "executiveSummary": "A 2-3 sentence overview of the most important outcomes from this meeting. Focus on decisions that affect residents.",
  
  "keyDecisions": [
    {
      "title": "Brief title of the decision",
      "description": "What was decided and its implications",
      "voteResult": {
        "yes": 5,
        "no": 2,
        "abstain": 0,
        "passed": true
      },
      "topics": ["relevant", "topic", "tags"]
    }
  ],
  
  "discussionTopics": [
    {
      "topic": "Topic title",
      "summary": "What was discussed about this topic",
      "category": "One of: housing, public_safety, education, environment, transportation, budget, utilities, parks, zoning, elections, other"
    }
  ],
  
  "publicComments": {
    "count": 12,
    "summary": "Brief summary of what residents spoke about",
    "themes": ["common", "themes", "raised"]
  },
  
  "upcomingItems": [
    {
      "title": "Item that will be discussed in future meetings",
      "expectedDate": "if mentioned"
    }
  ],
  
  "topics": ["array", "of", "all", "relevant", "topic", "tags"],
  
  "sentiment": "positive | neutral | contentious"
}

GUIDELINES:
1. Only include information explicitly stated in the document
2. If a section has no relevant content, use null or empty array
3. Vote results should only be included if explicitly mentioned
4. Topic tags should use lowercase with underscores
5. Sentiment should reflect the overall tone of the meeting
6. Be concise but informative
7. Highlight anything that directly affects residents (taxes, services, development)
```

## Topic Taxonomy

Use these standardized topics for tagging:

| Category | Description |
|----------|-------------|
| `housing` | Housing development, affordable housing, rentals |
| `public_safety` | Police, fire, emergency services, crime |
| `education` | Schools, school board, education funding |
| `environment` | Environmental protection, sustainability, climate |
| `transportation` | Roads, transit, traffic, parking |
| `budget` | Budget, taxes, fees, financial planning |
| `utilities` | Water, sewer, electric, waste management |
| `parks` | Parks, recreation, community spaces |
| `zoning` | Zoning changes, land use, development permits |
| `elections` | Elections, voting, political appointments |
| `healthcare` | Public health, hospitals, health services |
| `economic_development` | Business, jobs, economic growth |
| `infrastructure` | Construction, maintenance, public works |
| `community_services` | Social services, libraries, senior services |
| `other` | Anything not fitting above categories |

## Example Output

```json
{
  "executiveSummary": "The City Council approved a new mixed-use development on Main Street that will include 200 housing units and retail space. They also voted to increase the parks department budget by 15% to address maintenance backlogs.",
  
  "keyDecisions": [
    {
      "title": "Main Street Mixed-Use Development Approved",
      "description": "Council approved the Riverside Partners development proposal for 123 Main Street. The project includes 200 residential units (40 affordable), 15,000 sq ft of retail, and 300 parking spaces. Developer must contribute $500,000 to the affordable housing fund.",
      "voteResult": {
        "yes": 5,
        "no": 2,
        "abstain": 0,
        "passed": true
      },
      "topics": ["housing", "zoning", "economic_development"]
    },
    {
      "title": "Parks Department Budget Increase",
      "description": "Council approved a 15% increase to the parks department operating budget to address deferred maintenance. This will fund repairs to playgrounds at 5 parks and restore the summer concert series.",
      "voteResult": {
        "yes": 6,
        "no": 1,
        "abstain": 0,
        "passed": true
      },
      "topics": ["budget", "parks"]
    }
  ],
  
  "discussionTopics": [
    {
      "topic": "Traffic Impact Study",
      "summary": "Council members discussed concerns about traffic increases from the Main Street development. The developer agreed to fund a traffic signal upgrade at Main and Oak intersection.",
      "category": "transportation"
    },
    {
      "topic": "Summer Pool Hours",
      "summary": "Parks director proposed extending community pool hours on weekends. Decision deferred to next meeting pending staffing review.",
      "category": "parks"
    }
  ],
  
  "publicComments": {
    "count": 8,
    "summary": "Residents expressed mixed views on the Main Street development. Supporters cited job creation and housing needs. Opponents raised concerns about traffic, building height, and neighborhood character.",
    "themes": ["traffic concerns", "housing support", "building height"]
  },
  
  "upcomingItems": [
    {
      "title": "Community Pool Extended Hours Vote",
      "expectedDate": "Next council meeting"
    },
    {
      "title": "Annual Budget Hearing",
      "expectedDate": "October 15"
    }
  ],
  
  "topics": ["housing", "zoning", "economic_development", "budget", "parks", "transportation"],
  
  "sentiment": "contentious"
}
```

## Error Handling

If the document cannot be properly analyzed:

```json
{
  "error": true,
  "errorType": "insufficient_content | unreadable | not_meeting_document",
  "message": "Explanation of what went wrong"
}
```

## Prompt Iteration Notes

When iterating on this prompt:
1. Test with diverse meeting types (city council, school board, planning commission)
2. Test with different document formats (formal minutes, informal notes, transcripts)
3. Check that vote counting is accurate
4. Verify topic extraction is consistent
5. Ensure sentiment detection is reasonable
