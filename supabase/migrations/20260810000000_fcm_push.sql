-- Native push: store FCM device tokens alongside web-push subscriptions. Web subscriptions carry
-- endpoint + p256dh + auth (VAPID); an FCM token is a single string stored in `endpoint` with
-- type='fcm' and the key columns null. send-push branches on type: web -> VAPID, fcm -> FCM HTTP v1.
alter table public.push_subscriptions
  add column if not exists type text not null default 'web';
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth   drop not null;
