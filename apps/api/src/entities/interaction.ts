import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type {
  ActivityCategory,
  ActivityKind,
  ActivityStatus,
  CalendarType,
  ContactFieldKey,
  ContactVisibility,
  NotificationType,
  ReminderKind,
} from '@zupu/shared';

// M4 小程序与互动。表结构见 migrations/1732630000000-Interaction.ts

@Entity('contact_card')
export class ContactCardEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'jsonb', default: {} }) fields: Partial<Record<ContactFieldKey, string | null>>;
  @Column({ type: 'jsonb', default: {} }) visibility: Partial<Record<ContactFieldKey, ContactVisibility>>;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('clan_activity')
export class ClanActivityEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'varchar' }) kind: ActivityKind;
  @Column({ type: 'varchar', default: 'other' }) category: ActivityCategory;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'text', nullable: true }) content: string | null;
  @Column({ type: 'varchar', nullable: true }) location: string | null;
  @Column({ type: 'timestamptz', nullable: true }) startAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) endAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) signupDeadline: Date | null;
  @Column({ type: 'int', nullable: true }) maxParticipants: number | null;
  @Column({ type: 'boolean', default: true }) allowSignup: boolean;
  @Column({ type: 'boolean', default: false }) pinned: boolean;
  @Column({ type: 'varchar', nullable: true }) checkinCode: string | null;
  @Column({ type: 'varchar', default: 'published' }) status: ActivityStatus;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('activity_signup')
export class ActivitySignupEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) activityId: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'int', default: 1 }) headcount: number;
  @Column({ type: 'varchar', nullable: true }) note: string | null;
  @Column({ type: 'varchar', default: 'signed' }) status: 'signed' | 'cancelled';
  @Column({ type: 'timestamptz', nullable: true }) checkedInAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) checkedInBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('reminder_date')
export class ReminderDateEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) clanId: string;
  @Column({ type: 'uuid' }) personId: string;
  @Column({ type: 'varchar' }) kind: ReminderKind;
  @Column({ type: 'varchar' }) calendar: CalendarType;
  @Column({ type: 'int' }) month: number;
  @Column({ type: 'int' }) day: number;
  @Column({ type: 'boolean', default: false }) isLeapMonth: boolean;
  @Column({ type: 'int', nullable: true }) year: number | null;
}

@Entity('reminder_pref')
export class ReminderPrefEntity {
  @PrimaryColumn('uuid') userId: string;
  @PrimaryColumn('uuid') clanId: string;
  @Column({ type: 'boolean', default: true }) enabled: boolean;
  @Column({ type: 'boolean', default: true }) birthday: boolean;
  @Column({ type: 'boolean', default: true }) deathAnniversary: boolean;
  @Column({ type: 'boolean', default: true }) activity: boolean;
  @Column({ type: 'int', default: 1 }) daysBefore: number;
  @Column({ type: 'boolean', default: true }) wechat: boolean;
}

@Entity('wechat_subscription')
export class WechatSubscriptionEntity {
  @PrimaryColumn('uuid') userId: string;
  @PrimaryColumn('varchar') templateId: string;
  @Column({ type: 'int', default: 0 }) quota: number;
}

@Entity('notification')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid', nullable: true }) clanId: string | null;
  @Column({ type: 'varchar' }) type: NotificationType;
  @Column({ type: 'varchar' }) title: string;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ type: 'jsonb', nullable: true }) link: { kind: 'activity' | 'person'; id: string } | null;
  @Column({ type: 'varchar', nullable: true }) dedupeKey: string | null;
  @Column({ type: 'timestamptz', nullable: true }) readAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

export const INTERACTION_ENTITIES = [
  ContactCardEntity,
  ClanActivityEntity,
  ActivitySignupEntity,
  ReminderDateEntity,
  ReminderPrefEntity,
  WechatSubscriptionEntity,
  NotificationEntity,
];
