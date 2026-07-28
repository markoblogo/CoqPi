import type {
  ContextSource,
  ContextSourceExtraction,
  CounterpartyContextPackKind,
  FinderSourceAdapterDetectedFormat
} from './app-types'

export type ParserPackV1 =
  | 'job_page_v1'
  | 'investor_fund_v1'
  | 'accelerator_program_v1'
  | 'company_profile_v1'

const textIncludes = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase())

export const inferFinderParserPackV1 = ({
  jobKind,
  detectedFormat,
  text
}: {
  jobKind: CounterpartyContextPackKind
  detectedFormat: FinderSourceAdapterDetectedFormat
  text: string
}): ParserPackV1 => {
  const normalized = text.toLowerCase()

  if (
    jobKind === 'job' ||
    detectedFormat === 'linkedin_job' ||
    textIncludes(normalized, /\b(job|role|vacancy|hiring|responsibilit|requirements?)\b/)
  ) {
    return 'job_page_v1'
  }

  if (
    jobKind === 'accelerator' ||
    detectedFormat === 'accelerator_snippet' ||
    textIncludes(normalized, /\b(accelerator|incubator|cohort|applications?|program|batch|equity terms)\b/)
  ) {
    return 'accelerator_program_v1'
  }

  if (
    jobKind === 'investor' ||
    detectedFormat === 'investor_list' ||
    textIncludes(normalized, /\b(fund|investor|ticket|thesis|stage|portfolio)\b/)
  ) {
    return 'investor_fund_v1'
  }

  return 'company_profile_v1'
}

export const inferKnowledgeParserPackV1 = (
  source: Pick<ContextSource, 'kind' | 'label'> & {
    sourceFormat?: ContextSourceExtraction['sourceFormat']
    extraction: Pick<ContextSourceExtraction, 'roleFacts' | 'ownerFacts'> | null
  }
): ParserPackV1 => {
  const normalized = [
    source.kind,
    source.label,
    ...(source.extraction?.roleFacts ?? []),
    ...(source.extraction?.ownerFacts ?? [])
  ]
    .join(' ')
    .toLowerCase()

  if (textIncludes(normalized, /\b(job|role|vacancy|interview|hiring|responsibilit|requirements?)\b/)) {
    if (
      source.sourceFormat === 'csv' &&
      !textIncludes(normalized, /\b(investor|fund|ticket|thesis|stage|portfolio)\b/) &&
      !textIncludes(normalized, /\b(accelerator|incubator|cohort|applications?|program|batch|equity terms)\b/)
    ) {
      return 'company_profile_v1'
    }

    return 'job_page_v1'
  }

  if (textIncludes(normalized, /\b(accelerator|incubator|cohort|applications?|program|batch|equity terms)\b/)) {
    return 'accelerator_program_v1'
  }

  if (textIncludes(normalized, /\b(investor|fund|ticket|thesis|stage|portfolio)\b/)) {
    return 'investor_fund_v1'
  }

  return 'company_profile_v1'
}
