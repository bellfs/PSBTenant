import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { ArrowLeft, Send, User, Bot, Headphones, Clock, Camera, Activity } from 'lucide-react';
import { format } from 'date-fns';

export default function IssueDetail() {
  const { id } = useParams();
  const [issue, setIssue] = useState(null);
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('conversation');
  const chatEndRef = useRef(null);

  const fetchIssue = async () => {
    try {
      const data = await api.getIssue(id);
      setIssue(data.issue);
      setMessages(data.messages);
      setAttachments(data.attachments);
      setActivity(data.activity);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssue();
    const interval = setInterval(fetchIssue, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleReply = async () => {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await api.respondToIssue(id, replyText.trim());
      setReplyText('');
      await fetchIssue();
    } catch (err) {
      alert('Failed to send: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status) => {
    try {
      await api.updateIssue(id, { status });
      await fetchIssue();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };

  const handlePriorityChange = async (priority) => {
    try {
      await api.updateIssue(id, { priority });
      await fetchIssue();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };

  const formatDate = (dateStr) => {
    try { return format(new Date(dateStr + 'Z'), 'dd MMM yyyy, HH:mm'); }
    catch { return dateStr; }
  };

  const formatTime = (dateStr) => {
    try { return format(new Date(dateStr + 'Z'), 'HH:mm'); }
    catch { return ''; }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="empty-state">
        <h3>Issue not found</h3>
        <Link to="/issues" className="btn btn-secondary" style={{ marginTop: 16 }}>Back to Issues</Link>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link to="/issues" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /></Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="issue-ref" style={{ fontSize: 14 }}>{issue.uuid}</span>
            <span className={`badge badge-${issue.status}`}>{issue.status?.replace(/_/g, ' ')}</span>
            <span className={`badge badge-${issue.priority}`}>{issue.priority}</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4, letterSpacing: '-0.02em' }}>{issue.title}</h2>
        </div>
      </div>

      <div className="detail-grid">
        {/* Main content area */}
        <div>
          <div className="tabs">
            <button className={`tab ${activeTab === 'conversation' ? 'active' : ''}`} onClick={() => setActiveTab('conversation')}>
              Conversation ({messages.length})
            </button>
            <button className={`tab ${activeTab === 'photos' ? 'active' : ''}`} onClick={() => setActiveTab('photos')}>
              Photos ({attachments.length})
            </button>
            <button className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
              Activity Log
            </button>
          </div>

          {activeTab === 'conversation' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="chat-container" style={{ flex: 1, minHeight: 300, maxHeight: 'calc(100vh - 380px)' }}>
                {messages.map((msg, i) => (
                  <div key={msg.id} className={`chat-bubble ${msg.sender}`}>
                    <div className="chat-sender">
                      {msg.sender === 'tenant' && <><User size={10} /> {issue.tenant_name}</>}
                      {msg.sender === 'bot' && <><Bot size={10} /> AI Assistant</>}
                      {msg.sender === 'staff' && <><Headphones size={10} /> Staff</>}
                      {msg.sender === 'system' && 'System'}
                    </div>
                    {msg.message_type === 'image' && msg.media_url && (
                      <img src={msg.media_url} alt="Attachment" className="chat-image" />
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    <div className="chat-time">{formatTime(msg.created_at)}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="reply-box">
                <textarea
                  className="form-textarea"
                  placeholder="Type a manual response to the tenant..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                  rows={1}
                />
                <button className="btn btn-primary" onClick={handleReply} disabled={sending || !replyText.trim()}>
                  {sending ? <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Send size={15} />}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'photos' && (
            <div className="card">
              <div className="card-body">
                {attachments.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {attachments.map(att => (
                      <div key={att.id} style={{
                        background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                        overflow: 'hidden', border: '1px solid var(--border-light)'
                      }}>
                        <img
                          src={att.file_path}
                          alt="Issue photo"
                          style={{ width: '100%', height: 180, objectFit: 'cover' }}
                        />
                        {att.ai_analysis && (
                          <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--accent-light)' }}>AI Analysis:</strong>
                            <div style={{ marginTop: 4, lineHeight: 1.4 }}>
                              {(() => {
                                try {
                                  const parsed = JSON.parse(att.ai_analysis.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
                                  return parsed.likely_issue || parsed.description || att.ai_analysis.slice(0, 200);
                                } catch { return att.ai_analysis.slice(0, 200); }
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Camera />
                    <h3>No photos</h3>
                    <p>No photos have been shared for this issue yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="card">
              <div className="card-body">
                {activity.length > 0 ? activity.map(log => (
                  <div key={log.id} style={{
                    display: 'flex', gap: 12, padding: '10px 0',
                    borderBottom: '1px solid var(--border-light)', fontSize: 13
                  }}>
                    <Activity size={14} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{log.action.replace(/_/g, ' ')}</span>
                      {log.details && <span style={{ color: 'var(--text-secondary)' }}> &middot; {log.details}</span>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {log.performed_by} &middot; {formatDate(log.created_at)}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No activity recorded
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="detail-sidebar">
          <div className="card">
            <div className="card-header"><h3>Issue Details</h3></div>
            <div className="card-body">
              <div className="detail-field">
                <span className="detail-field-label">Status</span>
                <select
                  className="form-select"
                  value={issue.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  style={{ width: 'auto', padding: '4px 28px 4px 10px', fontSize: 12 }}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="awaiting_tenant">Awaiting Tenant</option>
                  <option value="escalated">Escalated</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Priority</span>
                <select
                  className="form-select"
                  value={issue.priority}
                  onChange={e => handlePriorityChange(e.target.value)}
                  style={{ width: 'auto', padding: '4px 28px 4px 10px', fontSize: 12 }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Category</span>
                <span className="detail-field-value" style={{ textTransform: 'capitalize' }}>
                  {issue.category?.replace(/_/g, ' ') || 'Uncategorised'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Created</span>
                <span className="detail-field-value">{formatDate(issue.created_at)}</span>
              </div>
              {issue.escalated_at && (
                <div className="detail-field">
                  <span className="detail-field-label">Escalated</span>
                  <span className="detail-field-value">{formatDate(issue.escalated_at)}</span>
                </div>
              )}
              {issue.resolved_at && (
                <div className="detail-field">
                  <span className="detail-field-label">Resolved</span>
                  <span className="detail-field-value">{formatDate(issue.resolved_at)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>Tenant</h3></div>
            <div className="card-body">
              <div className="detail-field">
                <span className="detail-field-label">Name</span>
                <span className="detail-field-value">{issue.tenant_name}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Phone</span>
                <span className="detail-field-value" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {issue.tenant_phone}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Property</span>
                <span className="detail-field-value">{issue.property_name}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Flat</span>
                <span className="detail-field-value">{issue.flat_number || issue.tenant_flat || 'N/A'}</span>
              </div>
            </div>
          </div>

          {issue.ai_diagnosis && (
            <div className="card">
              <div className="card-header"><h3>AI Diagnosis</h3></div>
              <div className="card-body">
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  {issue.ai_diagnosis}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
