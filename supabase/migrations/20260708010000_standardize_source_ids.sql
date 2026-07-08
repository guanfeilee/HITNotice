begin;

with source_id_map(old_id, new_id) as (
  values
    ('today-hit', 'today'),
    ('hit-today', 'today'),
    ('hit-news', 'news'),
    ('hit-undergraduate', 'undergraduate'),
    ('hit-graduate-school', 'postgraduate'),
    ('graduate', 'postgraduate'),
    ('graduate-school', 'postgraduate'),
    ('sa', 'aerospace'),
    ('astronautics', 'aerospace'),
    ('seie', 'electronic'),
    ('electronics-info', 'electronic'),
    ('sme', 'machine'),
    ('mechatronics', 'machine'),
    ('mse', 'material'),
    ('materials', 'material'),
    ('power', 'resource'),
    ('energy', 'resource'),
    ('hitee', 'electrical'),
    ('electrical-engineering', 'electrical'),
    ('electrical-school', 'electrical'),
    ('electrical-college', 'electrical'),
    ('ise', 'instrument'),
    ('som', 'management'),
    ('hbs', 'finance'),
    ('business', 'finance'),
    ('marxism', 'marx'),
    ('rwskxb', 'social'),
    ('humanities', 'social'),
    ('env', 'environment'),
    ('arch', 'architecture'),
    ('architecture-design', 'architecture'),
    ('jtxy', 'traffic'),
    ('transportation', 'traffic'),
    ('computing', 'computer'),
    ('chemeng', 'chem'),
    ('chemistry', 'chem'),
    ('medicine-health', 'med'),
    ('life-science', 'life'),
    ('future-tech', 'future')
)
update public.notices
set source_id = source_id_map.new_id
from source_id_map
where public.notices.source_id = source_id_map.old_id;

with source_id_map(old_id, new_id) as (
  values
    ('today-hit', 'today'),
    ('hit-today', 'today'),
    ('hit-news', 'news'),
    ('hit-undergraduate', 'undergraduate'),
    ('hit-graduate-school', 'postgraduate'),
    ('graduate', 'postgraduate'),
    ('graduate-school', 'postgraduate'),
    ('sa', 'aerospace'),
    ('astronautics', 'aerospace'),
    ('seie', 'electronic'),
    ('electronics-info', 'electronic'),
    ('sme', 'machine'),
    ('mechatronics', 'machine'),
    ('mse', 'material'),
    ('materials', 'material'),
    ('power', 'resource'),
    ('energy', 'resource'),
    ('hitee', 'electrical'),
    ('electrical-engineering', 'electrical'),
    ('electrical-school', 'electrical'),
    ('electrical-college', 'electrical'),
    ('ise', 'instrument'),
    ('som', 'management'),
    ('hbs', 'finance'),
    ('business', 'finance'),
    ('marxism', 'marx'),
    ('rwskxb', 'social'),
    ('humanities', 'social'),
    ('env', 'environment'),
    ('arch', 'architecture'),
    ('architecture-design', 'architecture'),
    ('jtxy', 'traffic'),
    ('transportation', 'traffic'),
    ('computing', 'computer'),
    ('chemeng', 'chem'),
    ('chemistry', 'chem'),
    ('medicine-health', 'med'),
    ('life-science', 'life'),
    ('future-tech', 'future')
),
ranked_subscription_sources as (
  select
    subscription_sources.id,
    subscription_sources.source_id,
    coalesce(source_id_map.new_id, subscription_sources.source_id) as normalized_source_id,
    row_number() over (
      partition by
        subscription_sources.subscription_id,
        coalesce(source_id_map.new_id, subscription_sources.source_id)
      order by
        case
          when source_id_map.old_id is null then 0
          else 1
        end,
        subscription_sources.created_at asc,
        subscription_sources.id asc
    ) as keep_rank
  from public.subscription_sources
  left join source_id_map on subscription_sources.source_id = source_id_map.old_id
)
delete from public.subscription_sources
using ranked_subscription_sources
where public.subscription_sources.id = ranked_subscription_sources.id
  and ranked_subscription_sources.keep_rank > 1
  and ranked_subscription_sources.source_id <> ranked_subscription_sources.normalized_source_id;

with source_id_map(old_id, new_id) as (
  values
    ('today-hit', 'today'),
    ('hit-today', 'today'),
    ('hit-news', 'news'),
    ('hit-undergraduate', 'undergraduate'),
    ('hit-graduate-school', 'postgraduate'),
    ('graduate', 'postgraduate'),
    ('graduate-school', 'postgraduate'),
    ('sa', 'aerospace'),
    ('astronautics', 'aerospace'),
    ('seie', 'electronic'),
    ('electronics-info', 'electronic'),
    ('sme', 'machine'),
    ('mechatronics', 'machine'),
    ('mse', 'material'),
    ('materials', 'material'),
    ('power', 'resource'),
    ('energy', 'resource'),
    ('hitee', 'electrical'),
    ('electrical-engineering', 'electrical'),
    ('electrical-school', 'electrical'),
    ('electrical-college', 'electrical'),
    ('ise', 'instrument'),
    ('som', 'management'),
    ('hbs', 'finance'),
    ('business', 'finance'),
    ('marxism', 'marx'),
    ('rwskxb', 'social'),
    ('humanities', 'social'),
    ('env', 'environment'),
    ('arch', 'architecture'),
    ('architecture-design', 'architecture'),
    ('jtxy', 'traffic'),
    ('transportation', 'traffic'),
    ('computing', 'computer'),
    ('chemeng', 'chem'),
    ('chemistry', 'chem'),
    ('medicine-health', 'med'),
    ('life-science', 'life'),
    ('future-tech', 'future')
)
update public.subscription_sources
set source_id = source_id_map.new_id
from source_id_map
where public.subscription_sources.source_id = source_id_map.old_id;

commit;
