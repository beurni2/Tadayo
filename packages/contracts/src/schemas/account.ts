// The caller's own account, devices, settings and the app's configuration (spec 21, 23, 36).
import * as z from "zod";

import {
  ContentVersion,
  Caption,
  ClubRef,
  DisplayName,
  Id,
  Instant,
  MediaClass,
  Occurrence,
  Provider,
  Timezone,
  Version,
  page,
} from "../common.ts";
import { named, tag, tagged } from "../registry.ts";
import { OwnDropState } from "./days.ts";

export const Me = named(
  "Me",
  "The caller's own account (spec 23): the only place its account id appears; everyone else knows the " +
    "caller by a membership interval (spec 31). No email address, ever. Until `age_confirmed` is true and " +
    "there's a `display_name`, the account can only finish setup or leave (FQ13, FQ69): every other route " +
    "answers PROFILE_INCOMPLETE, devices and analytics events included. `version` is what an edit sends as " +
    "`expected_version`.",
  z.object({
    id: Id,
    display_name: DisplayName.optional(),
    avatar_version: ContentVersion.optional(),
    age_confirmed: z.boolean(),
    version: Version,
  }),
);

export const AgeConfirmation = named(
  "AgeConfirmation",
  "The one confirmation that the person is 18 or older (FQ13): only `true` is accepted, and it can't be " +
    'taken back. The document can\'t say "only true" in a way the Swift generator reads, so the API checks it.',
  z.boolean().refine((value) => value, "only true"),
);

export const UpdateMeRequest = named(
  "UpdateMeRequest",
  "Change the caller's name or avatar, or confirm once that they're 18 or older (FQ13: `true` only, and " +
    "no birthdate). `avatar_upload_id` is a ready upload made for the avatar. A name or an avatar is taken " +
    "only once the age is confirmed, in this request or before. Only the fields sent change. A new name for " +
    "someone who has accepted a roster revision that's still open makes a new revision with that name, as " +
    "accepting does, which everyone accepts again, that account too (FQ66, FQ84).",
  z.strictObject({
    expected_version: Version,
    display_name: DisplayName.optional(),
    age_confirmed: AgeConfirmation.optional(),
    avatar_upload_id: Id.optional(),
  }),
);

export const OwnContribution = named(
  "OwnContribution",
  "One of the caller's own drops, in any club, even one they've left with their contributions kept, so " +
    "they can withdraw it later without browsing the club again (spec 22). Its photo or link comes from " +
    "`author-preview`.",
  z.object({
    drop_id: Id,
    club: ClubRef,
    occurrence: Occurrence,
    media_class: MediaClass,
    caption: Caption.optional(),
    state: OwnDropState,
    version: Version,
  }),
);

export const OwnContributionPage = named(
  "OwnContributionPage",
  "The caller's own drops, newest day first.",
  page(OwnContribution),
);

export const DeleteAccountRequest = named(
  "DeleteAccountRequest",
  "Delete the account: sessions and memberships are revoked first, then authored content is removed " +
    "everywhere (T27, spec 23).",
  z.strictObject({ confirm: tag("delete_my_account") }),
);

export const AccountDeletion = named(
  "AccountDeletion",
  "The deletion has started; access is already revoked (T27).",
  z.object({ state: tag("deleting"), requested_at: Instant }),
);

export const RemovalSecret = named(
  "RemovalSecret",
  "A random secret the app makes at each sign-in, which alone can remove that sign-in's device " +
    "registration; the server keeps only its hash (TECH-DESIGN section 6 (a)). Base64url, 43 to 128 characters.",
  z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
);

export const RegisterDeviceRequest = named(
  "RegisterDeviceRequest",
  "This sign-in's one device registration, replaced by each new token from iOS; registering a token " +
    "moves it from any earlier sign-in (TECH-DESIGN section 6). The zone sets quiet hours (T37). The " +
    "mechanism is finished in B8, in its own contract PR, with a privacy and security review.",
  z.strictObject({
    apns_token: z
      .string()
      .min(16)
      .max(512)
      .regex(/^[0-9a-fA-F]+$/),
    apns_environment: z.enum(["sandbox", "production"]),
    timezone: Timezone,
    removal_secret: RemovalSecret,
  }),
);

export const DeviceRegistration = named(
  "DeviceRegistration",
  "The registration as stored, without the token or the secret.",
  z.object({ apns_environment: z.enum(["sandbox", "production"]), timezone: Timezone, registered_at: Instant }),
);

export const RemoveDeviceRequest = named(
  "RemoveDeviceRequest",
  "Remove the registration of the sign-in that made this secret, sent at logout and again until it ends " +
    "(TECH-DESIGN section 6 (c), (d)). No session: the app deleted it at logout.",
  z.strictObject({ removal_secret: RemovalSecret }),
);

export const ProviderSwitch = named(
  "ProviderSwitch",
  "One provider adapter's remote switch (spec 17, 30): whether new links are accepted, and whether its " +
    "official player is offered after the reveal or only Open original (FQ11). The server enforces both " +
    "again, so a switch never grants anything (T60).",
  z.object({ provider: Provider, accepting_links: z.boolean(), player: z.boolean() }),
);

export const Config = named(
  "Config",
  "The provider switches, the same for every account (TECH-DESIGN section 6, T60). Limits aren't here: " +
    "the app and the server share them in code (T13).",
  z.object({ providers: z.array(ProviderSwitch).max(10) }),
);

export const NotificationPreferences = named(
  "NotificationPreferences",
  "The account's notification switches (S03-notifications; spec 21): Day is ready, Reactions and comments, " +
    "and Caption previews, which is off until the person turns it on (spec 20). Quiet hours and the two a " +
    "day are fixed rules, not settings (T36, T37). B8 builds the pushes.",
  z.object({ version: Version, day_ready: z.boolean(), responses: z.boolean(), text_previews: z.boolean() }),
);

export const NotificationPreferencesRequest = named(
  "NotificationPreferencesRequest",
  "Set every account switch, from the version the caller read.",
  z.strictObject({
    expected_version: Version,
    day_ready: z.boolean(),
    responses: z.boolean(),
    text_previews: z.boolean(),
  }),
);

export const ClubNotificationPreferences = named(
  "ClubNotificationPreferences",
  "One club's switches (G05-notifications; spec 21). A push needs both the account's switch and the " +
    "club's, so a club can only narrow what the account allows.",
  z.object({ version: Version, day_ready: z.boolean(), responses: z.boolean() }),
);

export const ClubNotificationPreferencesRequest = named(
  "ClubNotificationPreferencesRequest",
  "Set both of a club's switches, from the version the caller read.",
  z.strictObject({ expected_version: Version, day_ready: z.boolean(), responses: z.boolean() }),
);

const eventBase = {
  id: z.uuid(),
  client_time: Instant,
};

export const DraftSavedEvent = named(
  "DraftSavedEvent",
  "A private draft was saved: only that it happened, never its content or intended target (T30, T51).",
  z.strictObject({ name: tag("draft_saved"), ...eventBase }),
);

export const HelperOpenedEvent = named(
  "HelperOpenedEvent",
  "The idea helper was opened, never which idea was chosen (spec 12, T51).",
  z.strictObject({ name: tag("helper_opened"), ...eventBase }),
);

export const DropRenderedEvent = named(
  "DropRenderedEvent",
  "A revealed drop was shown: private instrumentation, never a receipt, never told to anyone (T34). The " +
    "server works out the rest, and drops an event for a drop the caller can't read now (T9).",
  z.strictObject({ name: tag("drop_rendered"), ...eventBase, drop_id: Id }),
);

export const ProviderFallbackEvent = named(
  "ProviderFallbackEvent",
  "A video player couldn't play and the app fell back to Open original (spec 17).",
  z.strictObject({
    name: tag("provider_fallback"),
    ...eventBase,
    provider: Provider,
    reason: z.enum(["login_required", "unavailable", "timeout", "unsupported", "switched_off"]),
  }),
);

export const ClientEvent = tagged(
  "ClientEvent",
  "An event only the app can see (spec 36). The server records the others itself.",
  "name",
  [DraftSavedEvent, HelperOpenedEvent, DropRenderedEvent, ProviderFallbackEvent],
);

export const ClientEventBatch = named(
  "ClientEventBatch",
  "Up to 50 events, refused whole if any field is unknown. Each `id` is recorded once, so a resent batch " +
    "records nothing twice; the answer is the same whatever the batch held (T14).",
  z.strictObject({ events: z.array(ClientEvent).min(1).max(50) }),
);
