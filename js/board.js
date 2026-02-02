/**
 * Reddit-style Board Module
 * LocalStorage-based discussion board with threads and nested comments
 */

const Board = (function() {
  'use strict';

  // Storage keys
  const STORAGE_KEYS = {
    THREADS: 'board_threads',
    COMMENTS: 'board_comments',
    VOTES: 'board_votes',
    INITIALIZED: 'board_initialized'
  };

  // State
  let threads = [];
  let comments = [];
  let userVotes = {}; // { itemId: 1 | -1 }
  let currentUser = 'Anonymous';

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Generate unique ID
   */
  function generateId() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get current timestamp
   */
  function now() {
    return Date.now();
  }

  /**
   * Format relative timestamp (2 hours ago, etc.)
   */
  function formatRelativeTime(timestamp) {
    const seconds = Math.floor((now() - timestamp) / 1000);
    
    if (seconds < 0) return 'just now';
    
    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'week', seconds: 604800 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 },
      { label: 'second', seconds: 1 }
    ];

    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) {
        return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
      }
    }
    
    return 'just now';
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Deep clone object
   */
  function deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.error('Deep clone failed:', e);
      return obj;
    }
  }

  // ============================================
  // STORAGE FUNCTIONS
  // ============================================

  /**
   * Save data to localStorage
   */
  function saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error(`Failed to save ${key}:`, e);
      return false;
    }
  }

  /**
   * Load data from localStorage
   */
  function loadFromStorage(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error(`Failed to load ${key}:`, e);
      return defaultValue;
    }
  }

  /**
   * Persist all data
   */
  function persistData() {
    saveToStorage(STORAGE_KEYS.THREADS, threads);
    saveToStorage(STORAGE_KEYS.COMMENTS, comments);
    saveToStorage(STORAGE_KEYS.VOTES, userVotes);
  }

  /**
   * Load all data from storage
   */
  function loadData() {
    threads = loadFromStorage(STORAGE_KEYS.THREADS, []);
    comments = loadFromStorage(STORAGE_KEYS.COMMENTS, []);
    userVotes = loadFromStorage(STORAGE_KEYS.VOTES, {});
  }

  // ============================================
  // SORTING ALGORITHMS
  // ============================================

  /**
   * Hot sorting algorithm (Reddit-style)
   * Combines score with time decay
   */
  function calculateHotScore(item) {
    const score = (item.upvotes || 0) - (item.downvotes || 0);
    const orderOfMagnitude = Math.log10(Math.max(Math.abs(score), 1));
    const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
    const seconds = (item.createdAt - 1134028003000) / 1000; // Reddit epoch
    return sign * orderOfMagnitude + seconds / 45000;
  }

  /**
   * Sort items by criteria
   */
  function sortItems(items, sortBy = 'hot') {
    const sorted = [...items];
    
    switch (sortBy) {
      case 'hot':
        return sorted.sort((a, b) => calculateHotScore(b) - calculateHotScore(a));
      case 'new':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'top':
        return sorted.sort((a, b) => {
          const scoreA = (a.upvotes || 0) - (a.downvotes || 0);
          const scoreB = (b.upvotes || 0) - (b.downvotes || 0);
          return scoreB - scoreA;
        });
      case 'controversial':
        return sorted.sort((a, b) => {
          const controvA = Math.min(a.upvotes, a.downvotes) / Math.max(a.upvotes, a.downvotes, 1);
          const controvB = Math.min(b.upvotes, b.downvotes) / Math.max(b.upvotes, b.downvotes, 1);
          return controvB - controvA;
        });
      default:
        return sorted;
    }
  }

  // ============================================
  // THREAD FUNCTIONS
  // ============================================

  /**
   * Create a new thread
   */
  function createThread(title, content, author = currentUser, tags = []) {
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Thread title is required');
    }

    const thread = {
      id: generateId(),
      title: title.trim(),
      content: (content || '').trim(),
      author: author || 'Anonymous',
      tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string') : [],
      createdAt: now(),
      updatedAt: now(),
      upvotes: 1,
      downvotes: 0,
      commentCount: 0,
      deleted: false
    };

    threads.unshift(thread);
    userVotes[thread.id] = 1; // Auto-upvote own post
    persistData();
    
    return deepClone(thread);
  }

  /**
   * Get all threads with sorting
   */
  function getThreads(sortBy = 'hot') {
    const activeThreads = threads.filter(t => !t.deleted);
    return sortItems(activeThreads, sortBy).map(deepClone);
  }

  /**
   * Get single thread by ID
   */
  function getThread(threadId) {
    const thread = threads.find(t => t.id === threadId && !t.deleted);
    return thread ? deepClone(thread) : null;
  }

  /**
   * Search threads by query
   */
  function searchThreads(query) {
    if (!query || typeof query !== 'string') return [];
    
    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    
    return threads
      .filter(t => !t.deleted)
      .filter(thread => {
        const searchText = `${thread.title} ${thread.content} ${thread.tags.join(' ')}`.toLowerCase();
        return searchTerms.every(term => searchText.includes(term));
      })
      .map(deepClone);
  }

  /**
   * Upvote a thread
   */
  function upvoteThread(threadId) {
    return voteItem(threadId, 1, 'thread');
  }

  /**
   * Downvote a thread
   */
  function downvoteThread(threadId) {
    return voteItem(threadId, -1, 'thread');
  }

  /**
   * Delete a thread (soft delete)
   */
  function deleteThread(threadId) {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }
    
    thread.deleted = true;
    thread.title = '[deleted]';
    thread.content = '[deleted]';
    thread.updatedAt = now();
    persistData();
    
    return true;
  }

  /**
   * Update thread comment count
   */
  function updateThreadCommentCount(threadId) {
    const thread = threads.find(t => t.id === threadId);
    if (thread) {
      thread.commentCount = comments.filter(c => c.threadId === threadId && !c.deleted).length;
      persistData();
    }
  }

  // ============================================
  // COMMENT FUNCTIONS
  // ============================================

  /**
   * Add a comment to a thread
   */
  function addComment(threadId, parentId, content, author = currentUser) {
    if (!threadId) {
      throw new Error('Thread ID is required');
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Comment content is required');
    }

    const thread = threads.find(t => t.id === threadId && !t.deleted);
    if (!thread) {
      throw new Error('Thread not found');
    }

    // Validate parent comment if specified
    if (parentId) {
      const parent = comments.find(c => c.id === parentId && !c.deleted);
      if (!parent) {
        throw new Error('Parent comment not found');
      }
    }

    const comment = {
      id: generateId(),
      threadId: threadId,
      parentId: parentId || null,
      content: content.trim(),
      author: author || 'Anonymous',
      createdAt: now(),
      updatedAt: now(),
      upvotes: 1,
      downvotes: 0,
      deleted: false,
      depth: parentId ? getCommentDepth(parentId) + 1 : 0
    };

    comments.push(comment);
    userVotes[comment.id] = 1; // Auto-upvote own comment
    updateThreadCommentCount(threadId);
    persistData();
    
    return deepClone(comment);
  }

  /**
   * Get comment depth for nesting
   */
  function getCommentDepth(commentId) {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return 0;
    if (!comment.parentId) return 0;
    return getCommentDepth(comment.parentId) + 1;
  }

  /**
   * Get comments for a thread with sorting
   */
  function getComments(threadId, sortBy = 'hot') {
    const threadComments = comments.filter(c => c.threadId === threadId && !c.deleted);
    return buildCommentTree(sortItems(threadComments, sortBy));
  }

  /**
   * Build nested comment tree
   */
  function buildCommentTree(flatComments) {
    const commentMap = {};
    const roots = [];

    // Create map of all comments
    flatComments.forEach(c => {
      commentMap[c.id] = { ...deepClone(c), replies: [] };
    });

    // Build tree structure
    flatComments.forEach(c => {
      const comment = commentMap[c.id];
      if (c.parentId && commentMap[c.parentId]) {
        commentMap[c.parentId].replies.push(comment);
      } else {
        roots.push(comment);
      }
    });

    return roots;
  }

  /**
   * Upvote a comment
   */
  function upvoteComment(commentId) {
    return voteItem(commentId, 1, 'comment');
  }

  /**
   * Downvote a comment
   */
  function downvoteComment(commentId) {
    return voteItem(commentId, -1, 'comment');
  }

  /**
   * Delete a comment (soft delete)
   */
  function deleteComment(commentId) {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    comment.deleted = true;
    comment.content = '[deleted]';
    comment.updatedAt = now();
    updateThreadCommentCount(comment.threadId);
    persistData();
    
    return true;
  }

  // ============================================
  // VOTING FUNCTIONS
  // ============================================

  /**
   * Generic vote function for threads and comments
   */
  function voteItem(itemId, direction, type) {
    const collection = type === 'thread' ? threads : comments;
    const item = collection.find(i => i.id === itemId && !i.deleted);
    
    if (!item) {
      throw new Error(`${type === 'thread' ? 'Thread' : 'Comment'} not found`);
    }

    const currentVote = userVotes[itemId] || 0;
    
    // Toggle vote if same direction, otherwise change
    if (currentVote === direction) {
      // Remove vote
      if (direction === 1) {
        item.upvotes = Math.max(0, item.upvotes - 1);
      } else {
        item.downvotes = Math.max(0, item.downvotes - 1);
      }
      delete userVotes[itemId];
    } else {
      // Remove old vote if exists
      if (currentVote === 1) {
        item.upvotes = Math.max(0, item.upvotes - 1);
      } else if (currentVote === -1) {
        item.downvotes = Math.max(0, item.downvotes - 1);
      }
      
      // Apply new vote
      if (direction === 1) {
        item.upvotes++;
      } else {
        item.downvotes++;
      }
      userVotes[itemId] = direction;
    }

    persistData();
    
    return {
      upvotes: item.upvotes,
      downvotes: item.downvotes,
      score: item.upvotes - item.downvotes,
      userVote: userVotes[itemId] || 0
    };
  }

  /**
   * Get user's vote for an item
   */
  function getUserVote(itemId) {
    return userVotes[itemId] || 0;
  }

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  /**
   * Render thread list to container
   */
  function renderThreadList(containerId, sortBy = 'hot') {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container #${containerId} not found`);
      return;
    }

    const sortedThreads = getThreads(sortBy);
    
    if (sortedThreads.length === 0) {
      container.innerHTML = `
        <div class="board-empty">
          <p>No threads yet. Be the first to post!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = sortedThreads.map(thread => renderThreadItem(thread)).join('');
    attachThreadEventListeners(container);
  }

  /**
   * Render single thread item
   */
  function renderThreadItem(thread) {
    const score = thread.upvotes - thread.downvotes;
    const userVote = getUserVote(thread.id);
    const tagsHtml = thread.tags.length > 0 
      ? `<div class="thread-tags">${thread.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="thread-item" data-thread-id="${thread.id}">
        <div class="vote-controls">
          <button class="vote-btn upvote ${userVote === 1 ? 'active' : ''}" data-action="upvote" data-id="${thread.id}" data-type="thread">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
          </button>
          <span class="vote-score" data-score-id="${thread.id}">${score}</span>
          <button class="vote-btn downvote ${userVote === -1 ? 'active' : ''}" data-action="downvote" data-id="${thread.id}" data-type="thread">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 20l8-8h-5V4H9v8H4z"/></svg>
          </button>
        </div>
        <div class="thread-content">
          <h3 class="thread-title">
            <a href="#" data-action="open-thread" data-id="${thread.id}">${escapeHtml(thread.title)}</a>
          </h3>
          ${tagsHtml}
          <div class="thread-meta">
            <span class="author">Posted by ${escapeHtml(thread.author)}</span>
            <span class="timestamp" data-timestamp="${thread.createdAt}">${formatRelativeTime(thread.createdAt)}</span>
            <span class="comment-count">${thread.commentCount} comment${thread.commentCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render comments tree
   */
  function renderComments(containerId, threadId, sortBy = 'hot') {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container #${containerId} not found`);
      return;
    }

    const commentTree = getComments(threadId, sortBy);
    
    if (commentTree.length === 0) {
      container.innerHTML = `
        <div class="comments-empty">
          <p>No comments yet. Start the conversation!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = commentTree.map(c => renderCommentItem(c)).join('');
    attachCommentEventListeners(container);
  }

  /**
   * Render single comment with replies
   */
  function renderCommentItem(comment, depth = 0) {
    const score = comment.upvotes - comment.downvotes;
    const userVote = getUserVote(comment.id);
    const maxDepth = 10;
    const actualDepth = Math.min(depth, maxDepth);

    const repliesHtml = comment.replies && comment.replies.length > 0
      ? comment.replies.map(r => renderCommentItem(r, depth + 1)).join('')
      : '';

    return `
      <div class="comment-item" data-comment-id="${comment.id}" style="margin-left: ${actualDepth * 20}px">
        <div class="comment-header">
          <div class="vote-controls vote-controls-inline">
            <button class="vote-btn upvote ${userVote === 1 ? 'active' : ''}" data-action="upvote" data-id="${comment.id}" data-type="comment">▲</button>
            <span class="vote-score" data-score-id="${comment.id}">${score}</span>
            <button class="vote-btn downvote ${userVote === -1 ? 'active' : ''}" data-action="downvote" data-id="${comment.id}" data-type="comment">▼</button>
          </div>
          <span class="author">${escapeHtml(comment.author)}</span>
          <span class="timestamp" data-timestamp="${comment.createdAt}">${formatRelativeTime(comment.createdAt)}</span>
        </div>
        <div class="comment-body">
          <p>${escapeHtml(comment.content)}</p>
        </div>
        <div class="comment-actions">
          <button class="reply-btn" data-action="reply" data-id="${comment.id}" data-thread="${comment.threadId}">Reply</button>
          <button class="delete-btn" data-action="delete-comment" data-id="${comment.id}">Delete</button>
        </div>
        <div class="reply-form-container" id="reply-form-${comment.id}" style="display: none;"></div>
        <div class="comment-replies">
          ${repliesHtml}
        </div>
      </div>
    `;
  }

  /**
   * Render new post modal
   */
  function renderNewPostModal() {
    // Remove existing modal if any
    const existing = document.getElementById('new-post-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'new-post-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop" data-action="close-modal"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>Create a New Post</h2>
          <button class="modal-close" data-action="close-modal">&times;</button>
        </div>
        <form id="new-post-form">
          <div class="form-group">
            <label for="post-title">Title *</label>
            <input type="text" id="post-title" name="title" required maxlength="300" placeholder="An interesting title...">
          </div>
          <div class="form-group">
            <label for="post-content">Content</label>
            <textarea id="post-content" name="content" rows="6" maxlength="40000" placeholder="Text (optional)"></textarea>
          </div>
          <div class="form-group">
            <label for="post-tags">Tags (comma separated)</label>
            <input type="text" id="post-tags" name="tags" placeholder="discussion, help, announcement">
          </div>
          <div class="form-group">
            <label for="post-author">Your Name</label>
            <input type="text" id="post-author" name="author" placeholder="Anonymous" maxlength="50">
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Post</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    attachModalEventListeners(modal);
    
    // Focus title input
    setTimeout(() => document.getElementById('post-title')?.focus(), 100);
    
    return modal;
  }

  /**
   * Show reply form for a comment
   */
  function showReplyForm(commentId, threadId) {
    // Hide any existing reply forms
    document.querySelectorAll('.reply-form-container').forEach(el => {
      el.style.display = 'none';
      el.innerHTML = '';
    });

    const container = document.getElementById(`reply-form-${commentId}`);
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = `
      <form class="reply-form" data-parent="${commentId}" data-thread="${threadId}">
        <textarea name="content" rows="3" placeholder="Write a reply..." required></textarea>
        <div class="reply-form-actions">
          <input type="text" name="author" placeholder="Your name (optional)" maxlength="50">
          <button type="button" class="btn btn-secondary btn-sm" data-action="cancel-reply">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Reply</button>
        </div>
      </form>
    `;

    // Attach form listener
    const form = container.querySelector('form');
    form.addEventListener('submit', handleReplySubmit);
    container.querySelector('[data-action="cancel-reply"]').addEventListener('click', () => {
      container.style.display = 'none';
      container.innerHTML = '';
    });

    container.querySelector('textarea').focus();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Attach event listeners to thread list
   */
  function attachThreadEventListeners(container) {
    container.addEventListener('click', handleVoteClick);
    container.addEventListener('click', handleThreadClick);
  }

  /**
   * Attach event listeners to comments
   */
  function attachCommentEventListeners(container) {
    container.addEventListener('click', handleVoteClick);
    container.addEventListener('click', handleCommentActionClick);
  }

  /**
   * Attach modal event listeners
   */
  function attachModalEventListeners(modal) {
    // Close modal handlers
    modal.querySelectorAll('[data-action="close-modal"]').forEach(el => {
      el.addEventListener('click', closeModal);
    });

    // Form submit
    const form = modal.querySelector('#new-post-form');
    if (form) {
      form.addEventListener('submit', handleNewPostSubmit);
    }

    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Handle vote button clicks
   */
  function handleVoteClick(e) {
    const btn = e.target.closest('[data-action="upvote"], [data-action="downvote"]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const type = btn.dataset.type;

    try {
      const result = type === 'thread' 
        ? (action === 'upvote' ? upvoteThread(id) : downvoteThread(id))
        : (action === 'upvote' ? upvoteComment(id) : downvoteComment(id));

      // Update UI without reload
      updateVoteUI(id, result);
    } catch (err) {
      console.error('Vote failed:', err);
    }
  }

  /**
   * Update vote UI elements
   */
  function updateVoteUI(itemId, result) {
    // Update score display
    const scoreEl = document.querySelector(`[data-score-id="${itemId}"]`);
    if (scoreEl) {
      scoreEl.textContent = result.score;
    }

    // Update button states
    const upBtn = document.querySelector(`[data-action="upvote"][data-id="${itemId}"]`);
    const downBtn = document.querySelector(`[data-action="downvote"][data-id="${itemId}"]`);

    if (upBtn) {
      upBtn.classList.toggle('active', result.userVote === 1);
    }
    if (downBtn) {
      downBtn.classList.toggle('active', result.userVote === -1);
    }
  }

  /**
   * Handle thread item clicks
   */
  function handleThreadClick(e) {
    const link = e.target.closest('[data-action="open-thread"]');
    if (!link) return;

    e.preventDefault();
    const threadId = link.dataset.id;
    
    // Dispatch custom event for thread open
    const event = new CustomEvent('board:thread-open', { 
      detail: { threadId, thread: getThread(threadId) }
    });
    document.dispatchEvent(event);
  }

  /**
   * Handle comment action clicks
   */
  function handleCommentActionClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === 'reply') {
      e.preventDefault();
      showReplyForm(btn.dataset.id, btn.dataset.thread);
    } else if (action === 'delete-comment') {
      e.preventDefault();
      if (confirm('Are you sure you want to delete this comment?')) {
        try {
          deleteComment(btn.dataset.id);
          // Re-render comments
          const threadId = btn.closest('[data-comment-id]')?.closest('[id^="comments"]')?.dataset?.threadId;
          if (threadId) {
            renderComments(btn.closest('[id]').id, threadId);
          } else {
            btn.closest('.comment-item').remove();
          }
        } catch (err) {
          console.error('Delete failed:', err);
        }
      }
    }
  }

  /**
   * Handle new post form submit
   */
  function handleNewPostSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const title = form.querySelector('[name="title"]').value;
    const content = form.querySelector('[name="content"]').value;
    const tagsStr = form.querySelector('[name="tags"]').value;
    const author = form.querySelector('[name="author"]').value || 'Anonymous';
    
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    try {
      const thread = createThread(title, content, author, tags);
      closeModal();
      
      // Dispatch event for thread created
      const event = new CustomEvent('board:thread-created', { detail: { thread } });
      document.dispatchEvent(event);
    } catch (err) {
      alert('Failed to create post: ' + err.message);
    }
  }

  /**
   * Handle reply form submit
   */
  function handleReplySubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const parentId = form.dataset.parent;
    const threadId = form.dataset.thread;
    const content = form.querySelector('[name="content"]').value;
    const author = form.querySelector('[name="author"]').value || 'Anonymous';

    try {
      const comment = addComment(threadId, parentId, content, author);
      
      // Hide form
      form.closest('.reply-form-container').style.display = 'none';
      
      // Dispatch event
      const event = new CustomEvent('board:comment-added', { detail: { comment, threadId } });
      document.dispatchEvent(event);
    } catch (err) {
      alert('Failed to add reply: ' + err.message);
    }
  }

  /**
   * Close modal
   */
  function closeModal() {
    const modal = document.getElementById('new-post-modal');
    if (modal) {
      modal.remove();
    }
  }

  // ============================================
  // DEMO DATA
  // ============================================

  /**
   * Initialize demo data on first load
   */
  function initDemoData() {
    if (loadFromStorage(STORAGE_KEYS.INITIALIZED)) {
      return false;
    }

    // Create demo threads
    const demoThreads = [
      {
        title: 'Welcome to the Board! 🎉',
        content: 'This is a Reddit-style discussion board built with vanilla JavaScript. Feel free to create threads, comment, and vote! All data is stored locally in your browser.',
        author: 'Admin',
        tags: ['announcement', 'welcome']
      },
      {
        title: 'What are you working on this week?',
        content: 'Share your current projects, goals, or what you\'re learning. Always interesting to see what everyone is up to!',
        author: 'CuriousCoder',
        tags: ['discussion', 'projects']
      },
      {
        title: 'Tips for productive coding sessions?',
        content: 'Looking for advice on how to stay focused during long coding sessions. What works for you? Pomodoro? Music? Coffee? Share your secrets!',
        author: 'NightOwlDev',
        tags: ['help', 'productivity']
      }
    ];

    // Create threads with varied timestamps
    const baseTime = now();
    demoThreads.forEach((data, index) => {
      const thread = createThread(data.title, data.content, data.author, data.tags);
      // Adjust timestamp for demo variety
      const threadObj = threads.find(t => t.id === thread.id);
      if (threadObj) {
        threadObj.createdAt = baseTime - (index * 3600000 * (index + 1)); // Stagger by hours
        threadObj.upvotes = Math.floor(Math.random() * 20) + 5;
        threadObj.downvotes = Math.floor(Math.random() * 3);
      }
    });

    // Add demo comments to first thread
    const firstThread = threads[threads.length - 1]; // Welcome thread
    if (firstThread) {
      const comment1 = addComment(firstThread.id, null, 'This is awesome! Love the clean design.', 'DesignFan');
      const comment2 = addComment(firstThread.id, null, 'Great to see more vanilla JS projects. Not everything needs React!', 'VanillaEnthusiast');
      
      // Add nested reply
      if (comment2) {
        addComment(firstThread.id, comment2.id, 'Totally agree! Sometimes simple is better.', 'SimplicitySam');
      }

      // Adjust timestamps
      comments.forEach((c, i) => {
        c.createdAt = baseTime - (i * 1800000); // 30 min apart
        c.upvotes = Math.floor(Math.random() * 10) + 1;
      });
    }

    persistData();
    saveToStorage(STORAGE_KEYS.INITIALIZED, true);
    
    return true;
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize the board
   */
  function initBoard(options = {}) {
    // Load existing data
    loadData();
    
    // Initialize demo data if first run
    if (options.withDemoData !== false) {
      initDemoData();
    }

    // Set current user if provided
    if (options.currentUser) {
      currentUser = options.currentUser;
    }

    // Auto-render if containers specified
    if (options.threadListContainer) {
      renderThreadList(options.threadListContainer, options.defaultSort || 'hot');
    }

    // Update timestamps periodically
    setInterval(updateTimestamps, 60000);

    console.log('Board initialized successfully');
    
    return {
      threads: getThreads(),
      comments: comments.length
    };
  }

  /**
   * Update all relative timestamps on page
   */
  function updateTimestamps() {
    document.querySelectorAll('[data-timestamp]').forEach(el => {
      const timestamp = parseInt(el.dataset.timestamp, 10);
      if (timestamp) {
        el.textContent = formatRelativeTime(timestamp);
      }
    });
  }

  /**
   * Set current user
   */
  function setCurrentUser(username) {
    currentUser = username || 'Anonymous';
  }

  /**
   * Clear all data (for testing/reset)
   */
  function clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.THREADS);
    localStorage.removeItem(STORAGE_KEYS.COMMENTS);
    localStorage.removeItem(STORAGE_KEYS.VOTES);
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
    threads = [];
    comments = [];
    userVotes = {};
  }

  // ============================================
  // PUBLIC API
  // ============================================

  return {
    // Initialization
    init: initBoard,
    
    // Thread operations
    createThread,
    getThreads,
    getThread,
    searchThreads,
    upvoteThread,
    downvoteThread,
    deleteThread,
    
    // Comment operations
    addComment,
    getComments,
    upvoteComment,
    downvoteComment,
    deleteComment,
    
    // Rendering
    renderThreadList,
    renderComments,
    renderNewPostModal,
    showReplyForm,
    
    // Utilities
    setCurrentUser,
    getUserVote,
    formatRelativeTime,
    clearAllData,
    
    // For debugging
    _getState: () => ({ threads: deepClone(threads), comments: deepClone(comments), votes: { ...userVotes } })
  };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Board;
}

// Global initBoard function
function initBoard(options) {
  return Board.init(options);
}
