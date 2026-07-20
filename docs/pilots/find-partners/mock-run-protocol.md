# find-partners mock-run protocol (research-only)

> Открыть для новой сессии как runnable checklist.

## 1) Как запускать (без кода)

1. Скопируй шаблон JSON в локальный файл и заполни query.
2. Проставь `mode=mock`.
3. Сформируй минимум 8 кандидатных гипотез.
4. Прогони ручную нормализацию под schema ниже.
5. Сохрани результат в local notes (без outbound).

Не выполнять:
- внешние отправки,
- авто-реакты к контактам,
- запись PII в логи/чаты/репо.

## 2) Input payload (run packet)

```json
{
  "run_id": "uuid",
  "run_mode": "mock-only",
  "date": "YYYY-MM-DD",
  "initiator": "owner-or-session-id",
  "query": {
    "domain": "agri-commodities",
    "target_role": "investor|partner|employer",
    "region": "EU|US|global",
    "maturity": "pre-seed|pilot|scale",
    "vertical": "crop|logistics|trading|analytics",
    "constraints": [
      "no out-of-scope outreach",
      "research only"
    ]
  },
  "evidence_minimum": {
    "sources_required_per_candidate": 1,
    "must_have_signal": [
      "program fit/portfolio signal or public role",
      "public contactability path (home page / form / profile)"
    ]
  },
  "output_target": {
    "target_count": 8,
    "min_confidence": 0.60,
    "include_risks": true
  },
  "approval": {
    "owner_approval_required": true,
    "can_outbound": false,
    "production_effects": false
  }
}
```

## 3) Output artifact schema

Сохраняем как локальный файл `find-partners-run-<run_id>.json`.

```json
{
  "run_id": "uuid",
  "mode": "mock-only",
  "status": "succeeded|insufficient-sources|rejected",
  "query": { ... },
  "candidates": [
    {
      "name": "Acme Ventures",
      "category": "investor|partner|employer",
      "source": "https://...",
      "fit": 0.84,
      "fit_rationale": "Short rationale tied to query",
      "risk": "low|medium|high",
      "outreach_readiness": "not-ready|ready",
      "next_action_hint": "Open application page and add to manual review"
    }
  ],
  "governance": {
    "owner": "owner-id",
    "approved_for_research": true,
    "approval_gate": "manual-review",
    "notes": "No production-side effects"
  },
  "validation": {
    "schema_valid": true,
    "count_target_met": true,
    "source_links_total": 8,
    "min_confidence_met": true
  }
}
```

## 4) Команды (для сессионного старта)

- Старт сессии: `Session: coqpi_find_partners_mock`
- Идентификатор: `run_id=<uuid>`
- Заполнение: `query JSON` (шаблон выше)
- Валидация (ручная):
  - источники валидные URL,
  - минимум 1 источник на кандидата,
  - `fit` в диапазоне `0..1`,
  - `status` = `succeeded` только если минимум target_count выполнен.

## 5) Чек-лист приемки

- [ ] `status` заполнен корректно: `succeeded`/`insufficient-sources`/`rejected`.
- [ ] `run_mode` == `mock-only`.
- [ ] Каждый кандидат имеет:
  - название,
  - категорию,
  - источник,
  - score (0..1),
  - rationale,
  - risk.
- [ ] Нет `outbound`-действий и авто-отправок.
- [ ] `governance.approved_for_research == true`.
- [ ] `validation.count_target_met` соответствует заполнению.
- [ ] `run_id`/дату добавили в `run-notes.md`.

## 6) Пример заполнения run-notes

Добавь запись в `run-notes.md`:

- run_id: `<uuid>`
- date: `<today>`
- query: `<кратко>`
- output_count: `<число>`
- checks: schema_valid=true, source_links_total>=target_count
- risks: `<кратко>`

---

Эта run-процедура не меняет runtime и не требует внешнего исполнения — это только локальный протокол для ручного проведения поиска/классификации.
