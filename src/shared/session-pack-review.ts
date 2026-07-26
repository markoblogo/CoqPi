import type { CounterpartyContextPack } from './app-types'
import type { SessionPayloadPackItem } from './session-payload-inspector'

export type SessionPackReviewFilter = 'all' | 'selected' | 'dropped'

export type SessionPackReviewItem = {
  id: string
  label: string
  selected: boolean
  dropped: boolean
  dropReason: string | null
  pack: CounterpartyContextPack | null
}

export const buildSessionPackReviewItems = ({
  packs,
  selectedPackIds,
  droppedPacks
}: {
  packs: CounterpartyContextPack[]
  selectedPackIds: string[]
  droppedPacks: SessionPayloadPackItem[]
}): SessionPackReviewItem[] => {
  const droppedById = new Map(droppedPacks.map((pack) => [pack.id, pack]))
  const items: SessionPackReviewItem[] = packs.map((pack) => ({
    id: pack.id,
    label: `${pack.partnerName} · ${pack.title}`,
    selected: selectedPackIds.includes(pack.id),
    dropped: droppedById.has(pack.id),
    dropReason: droppedById.get(pack.id)?.reason ?? null,
    pack
  }))

  for (const droppedPack of droppedPacks) {
    if (items.some((item) => item.id === droppedPack.id)) {
      continue
    }

    items.push({
      id: droppedPack.id,
      label: droppedPack.label,
      selected: selectedPackIds.includes(droppedPack.id),
      dropped: true,
      dropReason: droppedPack.reason,
      pack: null
    })
  }

  return items
}

export const filterSessionPackReviewItems = (
  items: SessionPackReviewItem[],
  filter: SessionPackReviewFilter
) => {
  if (filter === 'selected') {
    return items.filter((item) => item.selected)
  }

  if (filter === 'dropped') {
    return items.filter((item) => item.dropped)
  }

  return items
}

export const getSessionPackReviewFilterCounts = (
  items: SessionPackReviewItem[]
) => ({
  all: items.length,
  selected: items.filter((item) => item.selected).length,
  dropped: items.filter((item) => item.dropped).length
})
