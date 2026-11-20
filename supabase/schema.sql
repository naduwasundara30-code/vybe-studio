-- VYBE STUDIO: run this entire script in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled campaign',
  business_data jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  app_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists "Users can read their own projects" on public.projects;
create policy "Users can read their own projects" on public.projects
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects" on public.projects
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects" on public.projects
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects" on public.projects
  for delete to authenticated using (auth.uid() = user_id);

-- Private bucket: object paths must start with the authenticated user's UUID.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

drop policy if exists "Users can read their own product images" on storage.objects;
create policy "Users can read their own product images" on storage.objects
  for select to authenticated using (
    bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload their own product images" on storage.objects;
create policy "Users can upload their own product images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own product images" on storage.objects;
create policy "Users can update their own product images" on storage.objects
  for update to authenticated using (
    bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own product images" on storage.objects;
create policy "Users can delete their own product images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
