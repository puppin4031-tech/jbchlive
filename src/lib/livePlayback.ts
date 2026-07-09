type LiveChannelLike = {
  is_live?: boolean | null;
  stream_url?: string | null;
  gcp_channel_state?: string | null;
};

export const isPlayableLiveChannel = (channel?: LiveChannelLike | null) => {
  if (!channel?.is_live) return false;
  if (!channel.stream_url) return false;
  return true;
};

export const isPreparingLiveChannel = (channel?: LiveChannelLike | null) => {
  if (!channel?.is_live) return false;
  return !isPlayableLiveChannel(channel);
};