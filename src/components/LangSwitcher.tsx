import { LOCALES, useLocale, useT } from '../i18n'
import { Dropdown, MenuItem } from './Dropdown'

/** Language switcher for the top-right of the top bar. */
export function LangSwitcher() {
  const t = useT()
  const locale = useLocale((s) => s.locale)
  const setLocale = useLocale((s) => s.setLocale)
  const active = LOCALES.find((l) => l.id === locale) ?? LOCALES[0]

  return (
    <Dropdown
      label={<span className="lang-label">{active.short}</span>}
      title={t('topbar.langTitle')}
      align="right"
      width={168}
      className="lang-trigger"
    >
      {LOCALES.map((l) => (
        <MenuItem
          key={l.id}
          active={l.id === locale}
          hint={l.id === locale ? '✓' : undefined}
          onClick={() => setLocale(l.id)}
        >
          {l.label}
        </MenuItem>
      ))}
    </Dropdown>
  )
}
