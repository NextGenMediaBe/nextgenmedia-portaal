// Voorbeeldtemplates die de admin met één klik kan toevoegen. Puur (client-safe).

export const DEFAULT_TEMPLATES: { name: string; subject: string; body: string; kind: string }[] = [
  {
    name: 'Nieuwe scripts klaar',
    kind: 'scripts',
    subject: 'Nieuwe scripts klaar om te bekijken',
    body: `Hallo {{klantnaam}},

Er werden nieuwe scripts toegevoegd aan jouw dashboard.

Bekijk ze en keur ze goed of geef feedback.

Open jouw dashboard:
{{scripts_link}}

Groetjes
NextGenMedia`,
  },
  {
    name: 'Nieuw contract beschikbaar',
    kind: 'contract',
    subject: 'Nieuw contract beschikbaar',
    body: `Hallo {{klantnaam}},

Er werd een nieuw contract toegevoegd aan jouw portaal.

Bekijk en onderteken het contract via onderstaande link.
{{contract_link}}

Groetjes
NextGenMedia`,
  },
  {
    name: 'Contentshoot ingepland',
    kind: 'shoot',
    subject: 'Contentshoot ingepland',
    body: `Hallo {{klantnaam}},

Er werd een contentshoot ingepland.

Bekijk alle informatie in jouw dashboard.
{{dashboard_link}}

Groetjes
NextGenMedia`,
  },
]
