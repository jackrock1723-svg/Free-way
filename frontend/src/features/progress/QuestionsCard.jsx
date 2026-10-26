import { useState } from 'react';

// "Free way has N questions" card. Nothing is built until the user answers or skips; Skip always works.
export default function QuestionsCard({ questions, onDone }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState(() => questions.map(() => null));
  const q = questions[index];
  const answer = answers[index];
  const last = index === questions.length - 1;
  const set = (value) => setAnswers((current) => current.map((item, i) => (i === index ? value : item)));
  const next = (value = answer) => {
    const updated = answers.map((item, i) => (i === index ? value : item));
    setAnswers(updated);
    if (last) onDone(updated); else setIndex(index + 1);
  };
  return (
    <section className="questions-card" aria-label="Clarifying questions">
      <div className="questions-head">
        <p><strong>Free way has {questions.length} {questions.length === 1 ? 'question' : 'questions'}</strong></p>
        <div className="questions-pager">
          <button type="button" className="questions-arrow" aria-label="Previous question" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
          <span>Question {index + 1} of {questions.length}</span>
          <button type="button" className="questions-arrow" aria-label="Following question" disabled={last} onClick={() => setIndex(index + 1)}>›</button>
        </div>
      </div>
      <fieldset className="questions-options">
        <legend>{q.label}</legend>
        {q.options.map((option, i) => (
          <label key={option.title} className={`questions-option${answer?.choice === i ? ' is-chosen' : ''}`}>
            <input type="radio" name={`q-${q.id}`} checked={answer?.choice === i} onChange={() => set({ choice: i })} />
            <span><span className="questions-title">{option.title}{option.recommended && <span className="questions-badge">Recommended</span>}</span><span className="questions-desc">{option.description}</span></span>
          </label>
        ))}
        <input className="questions-custom" aria-label="Your own answer" placeholder="Or type your own answer…" value={answer?.custom || ''} onChange={(event) => set(event.target.value ? { custom: event.target.value } : null)} />
      </fieldset>
      <div className="questions-actions">
        <button type="button" className="button button-secondary" onClick={() => next(null)}>Skip</button>
        <button type="button" className="button button-primary" onClick={() => next()}>{last ? 'Start task' : 'Next question'}</button>
      </div>
    </section>
  );
}