import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from '../../frontend/src/homeRouting.js';

const cases = {
  chat: ['hi', 'Hello!', 'hey there', 'thanks', 'thank you so much', 'ok', 'vanakkam', 'idhu enna', 'idhu enna panudhu?',
    'what does this do?', 'What is React?', 'why is the build slow', 'how do I deploy this?', 'explain the login flow',
    'can you explain this file?', 'is this safe?', 'does it support dark mode', 'add', 'fix', 'calculator', 'hmm',
    'I am thinking about a calculator', 'my login is weird', '', '   '],
  build: ['build a calculator', 'Build a calculator app', 'fix the login bug', 'Fix the login bug.', 'add a dark mode toggle to the header',
    'create a landing page', 'please add a footer', 'can you fix the navbar on mobile', 'refactor utils.js', 'rename index.html to home.html',
    'delete the old tests', 'update the README', 'implement a todo list', 'change the button colour to pink', 'Add a short welcome line to index.html',
    'the signup form crashes, fix the form validation', 'Plan a pricing section for this project', 'Add a blocked file write to index.html'],
};

for (const [want, list] of Object.entries(cases)) {
  test(`routes to ${want}`, () => { for (const text of list) assert.equal(routeIntent(text), want, JSON.stringify(text)); });
}