const supportedHosts = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'facebook.com',
  'fb.watch',
  'x.com',
  'twitter.com',
  't.co'
];

function detectPlatform(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase();

  if (host.includes('youtu.be') || host.includes('youtube.com')) {
    return 'YouTube';
  }

  if (host.includes('instagram.com')) {
    return 'Instagram';
  }

  if (host.includes('facebook.com') || host.includes('fb.watch')) {
    return 'Facebook';
  }

  if (host.includes('x.com') || host.includes('twitter.com') || host.includes('t.co')) {
    return 'X / Twitter';
  }

  return null;
}

function isSupportedUrl(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase();
  return supportedHosts.some((supportedHost) => host.includes(supportedHost));
}

module.exports = {
  detectPlatform,
  isSupportedUrl
};
