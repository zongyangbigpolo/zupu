import type { LifeEvent, Media } from '@zupu/shared';
import type { LifeEventEntity, MediaEntity } from '../../entities';
import type { StorageService } from '../../common/storage.service';

export async function toMedia(m: MediaEntity, storage: StorageService): Promise<Media> {
  return {
    id: m.id,
    clanId: m.clanId,
    personId: m.personId,
    type: m.type,
    mimeType: m.mimeType,
    size: m.size,
    caption: m.caption,
    duration: m.duration,
    url: await storage.mediaUrl(m.id, m.storageKey),
    createdAt: m.createdAt.toISOString(),
  };
}

export function toEvent(e: LifeEventEntity): LifeEvent {
  return {
    id: e.id,
    clanId: e.clanId,
    personId: e.personId,
    type: e.type,
    title: e.title,
    eventDate: e.eventDate,
    eventText: e.eventText,
    place: e.place,
    description: e.description,
    sortOrder: e.sortOrder,
  };
}
