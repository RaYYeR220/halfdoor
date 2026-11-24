// Who gets the static "open in a browser" page at /demo instead of a new demo church: link unfurlers, crawlers,
// uptime monitors, command-line tools, scripts and headless browsers. The named unfurlers stay listed even where a
// broader word already covers them, so a future edit can't drop one by accident.
export const BOT_UA =
  /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|go-http|headless|scrapy|httpclient|slackbot|facebookexternalhit|twitterbot|discordbot|linkedinbot|whatsapp|telegrambot|googlebot|bingbot/i;

export const isBot = (userAgent: string | null) => BOT_UA.test(userAgent ?? '');
