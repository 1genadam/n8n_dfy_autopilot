const { google } = require('googleapis');
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

// YouTube API configuration
const YOUTUBE_CONFIG = {
  apiKey: process.env.YOUTUBE_API_KEY,
  clientId: process.env.YOUTUBE_CLIENT_ID,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/auth/youtube/callback',
  scopes: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube'
  ]
};

// Initialize YouTube API client
const initializeYouTubeClient = async (refreshToken) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      YOUTUBE_CONFIG.clientId,
      YOUTUBE_CONFIG.clientSecret,
      YOUTUBE_CONFIG.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    // Test the connection
    await youtube.channels.list({
      part: 'snippet',
      mine: true
    });

    logger.info('YouTube API client initialized successfully');
    return { success: true, youtube, oauth2Client };

  } catch (error) {
    logger.error('Failed to initialize YouTube client:', error);
    return { success: false, error: error.message };
  }
};

// Upload video to YouTube
const uploadVideoToYouTube = async (youtube, videoData, metadata) => {
  logger.info('Uploading video to YouTube:', metadata.title);

  try {
    // Prepare video file for upload
    const videoFile = await fs.readFile(videoData.videoPath);
    
    // Upload video
    const uploadResponse = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: '27', // Education category
          defaultLanguage: metadata.language || 'en'
        },
        status: {
          privacyStatus: metadata.privacy || 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: videoFile
      }
    });

    const videoId = uploadResponse.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    logger.info('Video uploaded successfully:', { videoId, videoUrl });

    return {
      success: true,
      videoId,
      videoUrl,
      uploadResponse: uploadResponse.data
    };

  } catch (error) {
    logger.error('Video upload failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Upload custom thumbnail
const uploadThumbnail = async (youtube, videoId, thumbnailPath) => {
  logger.info('Uploading custom thumbnail for video:', videoId);

  try {
    const thumbnailFile = await fs.readFile(thumbnailPath);

    const thumbnailResponse = await youtube.thumbnails.set({
      videoId: videoId,
      media: {
        body: thumbnailFile
      }
    });

    logger.info('Thumbnail uploaded successfully');
    return {
      success: true,
      thumbnailUrl: thumbnailResponse.data.items[0]?.default?.url
    };

  } catch (error) {
    logger.error('Thumbnail upload failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Create and upload playlist (optional)
const createOrUpdatePlaylist = async (youtube, playlistTitle, videoId) => {
  logger.info('Managing playlist for video:', videoId);

  try {
    // Check if playlist exists
    const playlistsResponse = await youtube.playlists.list({
      part: 'snippet',
      mine: true,
      maxResults: 50
    });

    let playlistId = null;
    const existingPlaylist = playlistsResponse.data.items.find(
      playlist => playlist.snippet.title === playlistTitle
    );

    if (existingPlaylist) {
      playlistId = existingPlaylist.id;
      logger.info('Using existing playlist:', playlistId);
    } else {
      // Create new playlist
      const createResponse = await youtube.playlists.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: playlistTitle,
            description: 'Automated n8n workflow tutorials created with DFY Autopilot'
          },
          status: {
            privacyStatus: 'public'
          }
        }
      });

      playlistId = createResponse.data.id;
      logger.info('Created new playlist:', playlistId);
    }

    // Add video to playlist
    await youtube.playlistItems.insert({
      part: 'snippet',
      requestBody: {
        snippet: {
          playlistId: playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId: videoId
          }
        }
      }
    });

    logger.info('Video added to playlist successfully');
    return {
      success: true,
      playlistId,
      playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`
    };

  } catch (error) {
    logger.error('Playlist management failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Generate YouTube OAuth URL for initial setup
const generateAuthUrl = () => {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CONFIG.clientId,
    YOUTUBE_CONFIG.clientSecret,
    YOUTUBE_CONFIG.redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: YOUTUBE_CONFIG.scopes,
    prompt: 'consent'
  });

  return authUrl;
};

// Exchange authorization code for tokens
const exchangeCodeForTokens = async (authCode) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      YOUTUBE_CONFIG.clientId,
      YOUTUBE_CONFIG.clientSecret,
      YOUTUBE_CONFIG.redirectUri
    );

    const { tokens } = await oauth2Client.getToken(authCode);
    
    logger.info('Successfully exchanged auth code for tokens');
    return {
      success: true,
      tokens
    };

  } catch (error) {
    logger.error('Token exchange failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Main video publishing function
const publishVideo = async (contentData, publishingOptions = {}) => {
  logger.info('Starting video publishing for content:', contentData.id);

  const publishResult = {
    contentId: contentData.id,
    startTime: new Date().toISOString(),
    phases: {},
    output: {}
  };

  try {
    // Phase 1: Initialize YouTube client
    logger.info('Phase 1: Initializing YouTube API client');
    const refreshToken = publishingOptions.refreshToken || process.env.YOUTUBE_REFRESH_TOKEN;
    
    if (!refreshToken) {
      throw new Error('YouTube refresh token is required for publishing');
    }

    const clientResult = await initializeYouTubeClient(refreshToken);
    publishResult.phases.initialization = clientResult;

    if (!clientResult.success) {
      throw new Error(`YouTube client initialization failed: ${clientResult.error}`);
    }

    const { youtube } = clientResult;

    // Phase 2: Prepare metadata
    logger.info('Phase 2: Preparing video metadata');
    const metadata = publishingOptions.metadata || {
      title: `n8n Workflow Tutorial - ${contentData.workflowId}`,
      description: `Learn how to use this automated n8n workflow.\n\nCreated with n8n DFY Autopilot.`,
      tags: ['n8n', 'automation', 'workflow', 'tutorial'],
      privacy: 'public'
    };

    publishResult.phases.metadata = { success: true, metadata };

    // Phase 3: Upload video
    logger.info('Phase 3: Uploading video to YouTube');
    const uploadResult = await uploadVideoToYouTube(youtube, contentData.output, metadata);
    publishResult.phases.upload = uploadResult;

    if (!uploadResult.success) {
      throw new Error(`Video upload failed: ${uploadResult.error}`);
    }

    const { videoId, videoUrl } = uploadResult;

    // Phase 4: Upload thumbnail (if available)
    if (contentData.output.thumbnailPath) {
      logger.info('Phase 4: Uploading custom thumbnail');
      const thumbnailResult = await uploadThumbnail(youtube, videoId, contentData.output.thumbnailPath);
      publishResult.phases.thumbnail = thumbnailResult;
    } else {
      publishResult.phases.thumbnail = { success: false, reason: 'No thumbnail provided' };
    }

    // Phase 5: Manage playlist (optional)
    if (publishingOptions.playlistTitle) {
      logger.info('Phase 5: Managing YouTube playlist');
      const playlistResult = await createOrUpdatePlaylist(
        youtube,
        publishingOptions.playlistTitle,
        videoId
      );
      publishResult.phases.playlist = playlistResult;
    }

    // Success - prepare final output
    publishResult.output = {
      videoId,
      videoUrl,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      privacy: metadata.privacy,
      publishedAt: new Date().toISOString(),
      playlistUrl: publishResult.phases.playlist?.playlistUrl || null
    };

    publishResult.success = true;

  } catch (error) {
    logger.error('Video publishing failed:', error);
    publishResult.success = false;
    publishResult.error = error.message;
  }

  publishResult.endTime = new Date().toISOString();
  publishResult.duration = new Date(publishResult.endTime) - new Date(publishResult.startTime);

  logger.info('Video publishing completed:', {
    success: publishResult.success,
    duration: publishResult.duration + 'ms',
    videoUrl: publishResult.output?.videoUrl
  });

  return publishResult;
};

// Get video analytics (optional)
const getVideoAnalytics = async (videoId, refreshToken) => {
  try {
    const clientResult = await initializeYouTubeClient(refreshToken);
    if (!clientResult.success) {
      throw new Error('Failed to initialize YouTube client');
    }

    const { youtube } = clientResult;

    const analyticsResponse = await youtube.videos.list({
      part: 'statistics,snippet',
      id: videoId
    });

    const video = analyticsResponse.data.items[0];
    if (!video) {
      throw new Error('Video not found');
    }

    return {
      success: true,
      analytics: {
        title: video.snippet.title,
        publishedAt: video.snippet.publishedAt,
        viewCount: parseInt(video.statistics.viewCount || 0),
        likeCount: parseInt(video.statistics.likeCount || 0),
        commentCount: parseInt(video.statistics.commentCount || 0)
      }
    };

  } catch (error) {
    logger.error('Failed to get video analytics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Update video metadata
const updateVideoMetadata = async (videoId, metadata, refreshToken) => {
  try {
    const clientResult = await initializeYouTubeClient(refreshToken);
    if (!clientResult.success) {
      throw new Error('Failed to initialize YouTube client');
    }

    const { youtube } = clientResult;

    const updateResponse = await youtube.videos.update({
      part: 'snippet',
      requestBody: {
        id: videoId,
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: '27'
        }
      }
    });

    logger.info('Video metadata updated successfully');
    return {
      success: true,
      updatedVideo: updateResponse.data
    };

  } catch (error) {
    logger.error('Failed to update video metadata:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Batch publish multiple videos
const batchPublishVideos = async (contentArray, publishingOptions = {}) => {
  logger.info(`Starting batch publishing for ${contentArray.length} videos`);

  const batchResults = {
    startTime: new Date().toISOString(),
    totalVideos: contentArray.length,
    results: [],
    summary: { successful: 0, failed: 0 }
  };

  for (let i = 0; i < contentArray.length; i++) {
    const content = contentArray[i];
    logger.info(`Publishing video ${i + 1}/${contentArray.length}: ${content.id}`);

    try {
      const result = await publishVideo(content, publishingOptions);
      batchResults.results.push(result);

      if (result.success) {
        batchResults.summary.successful++;
      } else {
        batchResults.summary.failed++;
      }

    } catch (error) {
      logger.error(`Batch publish failed for content ${content.id}:`, error.message);
      batchResults.results.push({
        contentId: content.id,
        success: false,
        error: error.message
      });
      batchResults.summary.failed++;
    }

    // Add delay between uploads to avoid rate limiting
    if (i < contentArray.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
    }
  }

  batchResults.endTime = new Date().toISOString();
  batchResults.duration = new Date(batchResults.endTime) - new Date(batchResults.startTime);

  logger.info('Batch publishing completed:', batchResults.summary);
  return batchResults;
};

module.exports = {
  publishVideo,
  generateAuthUrl,
  exchangeCodeForTokens,
  getVideoAnalytics,
  updateVideoMetadata,
  batchPublishVideos,
  initializeYouTubeClient
};