const Anthropic = require('@anthropic-ai/sdk');
const ffmpeg = require('fluent-ffmpeg');
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Content creation configuration
const CONTENT_CONFIG = {
  outputDir: path.join(__dirname, '../../uploads/content'),
  templatesDir: path.join(__dirname, '../../templates/video'),
  audioDir: path.join(__dirname, '../../temp/audio'),
  videoDir: path.join(__dirname, '../../temp/video'),
  screenshotDir: path.join(__dirname, '../../temp/screenshots'),
  defaultDuration: 300, // 5 minutes default video length
  videoResolution: { width: 1920, height: 1080 },
  audioSettings: {
    codec: 'libmp3lame',
    bitrate: 128,
    sampleRate: 44100
  }
};

// Initialize content creation environment
const initializeContentEnvironment = async () => {
  try {
    // Create necessary directories
    await Promise.all([
      fs.mkdir(CONTENT_CONFIG.outputDir, { recursive: true }),
      fs.mkdir(CONTENT_CONFIG.templatesDir, { recursive: true }),
      fs.mkdir(CONTENT_CONFIG.audioDir, { recursive: true }),
      fs.mkdir(CONTENT_CONFIG.videoDir, { recursive: true }),
      fs.mkdir(CONTENT_CONFIG.screenshotDir, { recursive: true })
    ]);
    
    logger.info('Content creation environment initialized');
    return { success: true };
  } catch (error) {
    logger.error('Failed to initialize content environment:', error);
    return { success: false, error: error.message };
  }
};

// Generate video script using Claude
const generateVideoScript = async (workflowData) => {
  logger.info('Generating video script for workflow:', workflowData.id);
  
  try {
    const systemPrompt = `You are an expert technical educator and content creator specializing in n8n workflow tutorials. Your task is to create engaging, educational video scripts that explain how to use and customize n8n workflows.

SCRIPT REQUIREMENTS:
1. Create a clear, step-by-step tutorial script
2. Use conversational tone suitable for video narration
3. Include specific technical details about nodes and connections
4. Explain the business value and use cases
5. Provide customization tips and best practices
6. Include timing cues for visual demonstrations
7. Keep segments under 30 seconds for good pacing

SCRIPT STRUCTURE:
- Introduction (30 seconds)
- Workflow overview (60 seconds)
- Step-by-step breakdown (180 seconds)
- Customization tips (60 seconds)
- Conclusion and next steps (30 seconds)

TONE: Professional but approachable, educational, enthusiastic about automation

The workflow details will be provided in the user message.`;

    const userPrompt = `Create a video tutorial script for this n8n workflow:

WORKFLOW DETAILS:
- Name: ${workflowData.workflow.name}
- Description: ${workflowData.workflow.description || 'Custom automation workflow'}
- Node Count: ${workflowData.workflow.nodes.length}
- Complexity: ${workflowData.metadata?.complexity || 'Medium'}
- Use Case: ${workflowData.customerRequest?.description || 'Business automation'}

WORKFLOW NODES:
${workflowData.workflow.nodes.map(node => `- ${node.name} (${node.type})`).join('\n')}

WORKFLOW CONNECTIONS:
${Object.keys(workflowData.workflow.connections).length} main connections between nodes

TARGET AUDIENCE: Business users and automation enthusiasts who want to implement this workflow

Create a comprehensive tutorial script that guides viewers through understanding, implementing, and customizing this workflow. Include specific node names and explain the data flow between components.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const script = response.content[0].text;
    
    // Parse script into segments for easier video production
    const segments = parseScriptIntoSegments(script);
    
    logger.info('Video script generated with', segments.length, 'segments');
    
    return {
      success: true,
      script: {
        full: script,
        segments,
        estimatedDuration: segments.reduce((total, seg) => total + seg.duration, 0),
        wordCount: script.split(' ').length
      }
    };
    
  } catch (error) {
    logger.error('Failed to generate video script:', error);
    return { success: false, error: error.message };
  }
};

// Parse script into timed segments
const parseScriptIntoSegments = (script) => {
  const segments = [];
  const lines = script.split('\n').filter(line => line.trim());
  
  let currentSegment = '';
  let segmentType = 'intro';
  let segmentDuration = 30;
  
  for (const line of lines) {
    // Detect section headers and timing cues
    if (line.includes('Introduction') || line.includes('INTRO')) {
      if (currentSegment) segments.push({ type: segmentType, content: currentSegment.trim(), duration: segmentDuration });
      segmentType = 'intro';
      segmentDuration = 30;
      currentSegment = '';
    } else if (line.includes('Overview') || line.includes('OVERVIEW')) {
      if (currentSegment) segments.push({ type: segmentType, content: currentSegment.trim(), duration: segmentDuration });
      segmentType = 'overview';
      segmentDuration = 60;
      currentSegment = '';
    } else if (line.includes('Step') || line.includes('STEP')) {
      if (currentSegment) segments.push({ type: segmentType, content: currentSegment.trim(), duration: segmentDuration });
      segmentType = 'step';
      segmentDuration = 45;
      currentSegment = '';
    } else if (line.includes('Customization') || line.includes('TIPS')) {
      if (currentSegment) segments.push({ type: segmentType, content: currentSegment.trim(), duration: segmentDuration });
      segmentType = 'tips';
      segmentDuration = 30;
      currentSegment = '';
    } else if (line.includes('Conclusion') || line.includes('CONCLUSION')) {
      if (currentSegment) segments.push({ type: segmentType, content: currentSegment.trim(), duration: segmentDuration });
      segmentType = 'conclusion';
      segmentDuration = 30;
      currentSegment = '';
    } else {
      currentSegment += line + '\n';
    }
  }
  
  // Add final segment
  if (currentSegment) {
    segments.push({ type: segmentType, content: currentSegment.trim(), duration: segmentDuration });
  }
  
  return segments;
};

// Generate text-to-speech audio (placeholder for TTS service integration)
const generateAudio = async (script, outputPath) => {
  logger.info('Generating audio for script (using placeholder TTS)');
  
  try {
    // For now, create a placeholder audio file
    // In production, integrate with ElevenLabs or similar TTS service
    const placeholderAudio = path.join(__dirname, '../../assets/placeholder-audio.mp3');
    
    // Check if placeholder exists, if not create silence
    try {
      await fs.access(placeholderAudio);
      await fs.copyFile(placeholderAudio, outputPath);
    } catch {
      // Generate silent audio file with ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input('anullsrc=channel_layout=stereo:sample_rate=44100')
          .inputFormat('lavfi')
          .audioCodec('libmp3lame')
          .audioBitrate(128)
          .duration(script.estimatedDuration || 300)
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    }
    
    logger.info('Audio generated:', outputPath);
    return { success: true, audioPath: outputPath };
    
  } catch (error) {
    logger.error('Audio generation failed:', error);
    return { success: false, error: error.message };
  }
};

// Create video slides/visuals
const generateVideoVisuals = async (workflowData, segments) => {
  logger.info('Generating video visuals for', segments.length, 'segments');
  
  const visuals = [];
  
  try {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const slideData = await generateSlideContent(segment, workflowData, i);
      visuals.push(slideData);
    }
    
    return { success: true, visuals };
    
  } catch (error) {
    logger.error('Visual generation failed:', error);
    return { success: false, error: error.message };
  }
};

// Generate content for individual slide
const generateSlideContent = async (segment, workflowData, index) => {
  const slideId = `slide_${index}_${segment.type}`;
  const slidePath = path.join(CONTENT_CONFIG.videoDir, `${slideId}.png`);
  
  // For now, create placeholder slides with text overlays
  // In production, integrate with design tools or use HTML/CSS to canvas
  const slideContent = {
    id: slideId,
    type: segment.type,
    duration: segment.duration,
    content: segment.content,
    imagePath: slidePath,
    elements: []
  };
  
  // Add workflow-specific elements based on segment type
  switch (segment.type) {
    case 'intro':
      slideContent.elements.push({
        type: 'title',
        text: workflowData.workflow.name,
        position: { x: 960, y: 400 }
      });
      break;
      
    case 'overview':
      slideContent.elements.push({
        type: 'workflow_diagram',
        workflow: workflowData.workflow,
        position: { x: 960, y: 540 }
      });
      break;
      
    case 'step':
      slideContent.elements.push({
        type: 'node_highlight',
        nodes: extractNodesFromSegment(segment.content, workflowData.workflow),
        position: { x: 960, y: 540 }
      });
      break;
  }
  
  return slideContent;
};

// Extract node references from script segment
const extractNodesFromSegment = (content, workflow) => {
  const nodeNames = workflow.nodes.map(node => node.name);
  const referencedNodes = nodeNames.filter(name => 
    content.toLowerCase().includes(name.toLowerCase())
  );
  return referencedNodes;
};

// Combine audio and visuals into final video
const assembleVideo = async (audioPath, visuals, outputPath) => {
  logger.info('Assembling final video with', visuals.length, 'visual segments');
  
  try {
    // Create video sequence with ffmpeg
    let ffmpegCommand = ffmpeg()
      .input(audioPath)
      .audioCodec('copy');
    
    // For now, create a simple video with static background and text
    // In production, implement proper slide transitions and animations
    const backgroundImage = path.join(__dirname, '../../assets/video-background.png');
    
    // Check if background exists, create if not
    try {
      await fs.access(backgroundImage);
    } catch {
      // Create simple background with ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input('color=c=darkblue:size=1920x1080')
          .inputFormat('lavfi')
          .frames(1)
          .output(backgroundImage)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    }
    
    // Create final video
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(backgroundImage)
        .input(audioPath)
        .complexFilter([
          '[0:v]loop=loop=-1:size=1:start=0[bg]',
          '[bg]scale=1920:1080[scaled]'
        ])
        .map('[scaled]')
        .map('1:a')
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-preset medium',
          '-crf 23'
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    
    logger.info('Video assembly completed:', outputPath);
    return { success: true, videoPath: outputPath };
    
  } catch (error) {
    logger.error('Video assembly failed:', error);
    return { success: false, error: error.message };
  }
};

// Main content creation function
const createContent = async (workflowData) => {
  logger.info('Starting content creation for workflow:', workflowData.id);
  
  const contentId = uuidv4();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const contentResult = {
    id: contentId,
    workflowId: workflowData.id,
    startTime: new Date().toISOString(),
    phases: {},
    output: {}
  };
  
  try {
    // Phase 1: Initialize environment
    logger.info('Phase 1: Initializing content creation environment');
    const envResult = await initializeContentEnvironment();
    contentResult.phases.environment = envResult;
    
    if (!envResult.success) {
      throw new Error(`Environment initialization failed: ${envResult.error}`);
    }
    
    // Phase 2: Generate script
    logger.info('Phase 2: Generating video script');
    const scriptResult = await generateVideoScript(workflowData);
    contentResult.phases.script = scriptResult;
    
    if (!scriptResult.success) {
      throw new Error(`Script generation failed: ${scriptResult.error}`);
    }
    
    // Phase 3: Generate audio
    logger.info('Phase 3: Generating audio narration');
    const audioPath = path.join(CONTENT_CONFIG.audioDir, `${contentId}-${timestamp}.mp3`);
    const audioResult = await generateAudio(scriptResult.script, audioPath);
    contentResult.phases.audio = audioResult;
    
    if (!audioResult.success) {
      throw new Error(`Audio generation failed: ${audioResult.error}`);
    }
    
    // Phase 4: Generate visuals
    logger.info('Phase 4: Generating video visuals');
    const visualsResult = await generateVideoVisuals(workflowData, scriptResult.script.segments);
    contentResult.phases.visuals = visualsResult;
    
    if (!visualsResult.success) {
      throw new Error(`Visuals generation failed: ${visualsResult.error}`);
    }
    
    // Phase 5: Assemble final video
    logger.info('Phase 5: Assembling final video');
    const videoPath = path.join(CONTENT_CONFIG.outputDir, `${contentId}-${timestamp}.mp4`);
    const assemblyResult = await assembleVideo(audioPath, visualsResult.visuals, videoPath);
    contentResult.phases.assembly = assemblyResult;
    
    if (!assemblyResult.success) {
      throw new Error(`Video assembly failed: ${assemblyResult.error}`);
    }
    
    // Success - prepare final output
    contentResult.output = {
      videoPath: assemblyResult.videoPath,
      audioPath: audioResult.audioPath,
      script: scriptResult.script,
      visuals: visualsResult.visuals,
      metadata: {
        duration: scriptResult.script.estimatedDuration,
        resolution: CONTENT_CONFIG.videoResolution,
        fileSize: await getFileSize(assemblyResult.videoPath),
        contentId
      }
    };
    
    contentResult.success = true;
    
  } catch (error) {
    logger.error('Content creation failed:', error);
    contentResult.success = false;
    contentResult.error = error.message;
  }
  
  contentResult.endTime = new Date().toISOString();
  contentResult.duration = new Date(contentResult.endTime) - new Date(contentResult.startTime);
  
  logger.info('Content creation completed:', {
    success: contentResult.success,
    duration: contentResult.duration + 'ms'
  });
  
  return contentResult;
};

// Get file size utility
const getFileSize = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      bytes: stats.size,
      mb: Math.round(stats.size / (1024 * 1024) * 100) / 100
    };
  } catch {
    return { bytes: 0, mb: 0 };
  }
};

// Create content thumbnail
const createThumbnail = async (videoPath, outputPath) => {
  try {
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(10) // Seek to 10 seconds
        .frames(1)
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    
    return { success: true, thumbnailPath: outputPath };
  } catch (error) {
    logger.error('Thumbnail creation failed:', error);
    return { success: false, error: error.message };
  }
};

// Generate video metadata for publishing
const generateVideoMetadata = (workflowData, contentResult) => {
  const metadata = {
    title: `How to Use: ${workflowData.workflow.name} - n8n Automation Tutorial`,
    description: generateVideoDescription(workflowData),
    tags: generateVideoTags(workflowData),
    category: 'Education',
    privacy: 'public',
    thumbnail: null, // Will be set separately
    duration: contentResult.output.metadata.duration,
    language: 'en'
  };
  
  return metadata;
};

// Generate YouTube description
const generateVideoDescription = (workflowData) => {
  return `Learn how to implement and customize this powerful n8n automation workflow!

🎯 What You'll Learn:
- Complete workflow setup and configuration
- Node-by-node breakdown and explanations  
- Customization tips and best practices
- Real-world use cases and applications

📋 Workflow Details:
- Nodes: ${workflowData.workflow.nodes.length}
- Complexity: ${workflowData.metadata?.complexity || 'Medium'}
- Use Case: ${workflowData.customerRequest?.description || 'Business automation'}

🔗 Resources:
- Download workflow JSON (link in comments)
- n8n Documentation: https://docs.n8n.io
- Community Support: https://community.n8n.io

⚡ Created with n8n DFY Autopilot - Automated workflow generation and tutorial creation system.

#n8n #automation #workflow #nocode #productivity`;
};

// Generate video tags
const generateVideoTags = (workflowData) => {
  const baseTags = ['n8n', 'automation', 'workflow', 'tutorial', 'nocode'];
  const nodeTypes = workflowData.workflow.nodes.map(node => 
    node.type.split('.').pop().toLowerCase()
  );
  const uniqueNodeTags = [...new Set(nodeTypes)].slice(0, 10);
  
  return [...baseTags, ...uniqueNodeTags];
};

module.exports = {
  createContent,
  generateVideoScript,
  generateVideoMetadata,
  createThumbnail,
  initializeContentEnvironment
};