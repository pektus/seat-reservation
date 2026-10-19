# AGENTS.md

## Purpose

This repository uses multiple AI models through Antigravity.

Current model roster:
- Gemini 3.8 Flash
- Claude Sonnet 5.5
- Claude Opus 5.5

GPT-OSS 120B has been retired and is no longer part of any workflow.

---

# Agent Routing Strategy

| Agent | Primary Role | Use When |
|---------|------------|----------|
| Gemini 3.8 Flash | Fast analysis and repository understanding | Discovery, indexing, summarization, context gathering |
| Claude Sonnet 5.5 | Primary implementation agent | Coding, features, fixes, tests, refactoring |
| Claude Opus 5.5 | Architecture and expert reasoning | Design reviews, security analysis, root cause analysis |

---

# Agent Definitions

## GEMINI_FLASH

Responsibilities:
- Repository exploration
- Codebase mapping
- Documentation summarization
- Dependency analysis
- Log analysis
- Context gathering
- Initial implementation planning

Do Not Use For:
- Final architecture decisions
- Security signoff
- High-risk design approvals

---

## CLAUDE_SONNET_5_5

Responsibilities:
- Feature implementation
- Refactoring
- Unit testing
- Integration work
- Bug fixing
- Documentation updates

Default assignment for development work.

---

## CLAUDE_OPUS_5_5

Responsibilities:
- Architecture decisions
- Root cause analysis
- Security reviews
- Complex debugging
- Scalability analysis
- High-risk technical decisions

---

# Confidence-Based Routing Layer

## High Confidence (90-100)

Characteristics:
- Clear requirements
- Existing patterns available
- Localized changes
- Documentation updates
- UI updates
- Standard CRUD operations

Route:
Sonnet only

Workflow:
Task → Sonnet → Complete

---

## Medium Confidence (70-89)

Characteristics:
- Moderate ambiguity
- Cross-module changes
- Refactoring
- New endpoints
- Performance improvements

Route:
Gemini → Sonnet

Workflow:
Task → Gemini Analysis → Sonnet → Complete

---

## Low Confidence (0-69)

Characteristics:
- Architecture changes
- Security-sensitive work
- Unknown root causes
- Production incidents
- Distributed systems
- Large refactors

Route:
Gemini → Opus → Sonnet

Workflow:
Research → Design → Implementation

---

# Automated Scoring Matrix

Start at 100.

Subtract:
- Architecture change: -30
- Unknown codebase area: -15
- Security related: -30
- Database migration: -20
- External integration: -15
- Production incident: -25
- Multiple services: -20
- Unclear requirements: -25

Routing:
- 90-100 = Sonnet
- 70-89 = Gemini + Sonnet
- 40-69 = Gemini + Opus + Sonnet
- 0-39 = Mandatory Opus review before implementation

---

# Dynamic Escalation Workflow

Default:
Gemini Analysis
↓
Sonnet Implementation

Escalate to Opus when:
- Security concerns exist
- Architecture is impacted
- Data consistency risk exists
- Root cause is unclear
- Confidence drops below 60

Workflow:
Gemini
↓
Sonnet
↓
Escalation Needed?
├─ No → Complete
└─ Yes → Opus Review → Sonnet Update → Complete

---

# Task Classification

## Category A - Simple Execution
Route:
Gemini → Sonnet

## Category B - Feature Development
Route:
Gemini → Sonnet

## Category C - Complex Engineering
Route:
Gemini → Opus → Sonnet

## Category D - Critical Changes
Route:
Gemini → Opus → Sonnet → Opus Final Approval

Examples:
- Security
- Authentication
- Authorization
- Payments
- Infrastructure
- Database migrations

---

# Claude Opus 5.5 Architecture Review Template

## Problem
## Constraints
## Option A
## Option B
## Recommendation
## Risks
## Scalability Impact
## Security Impact
## Rollout Strategy

---

# Claude Sonnet 5.5 Implementation Checklist

Before completion verify:

- Requirements satisfied
- Existing patterns reused
- Minimal code changes
- Tests added
- Documentation updated
- Error handling included
- Security reviewed
- Backward compatibility maintained
- No duplicated logic

Output:

## Summary
## Files Changed
## Implementation Details
## Tests Added
## Known Limitations

---

# Automatic Escalation Rules

Mandatory Opus involvement when:

- More than 10 files modified
- More than 500 lines changed
- Authentication affected
- Authorization affected
- Database schema modified
- Infrastructure changes introduced
- Cross-service dependencies introduced
- Confidence score below 60

Mandatory Opus Final Approval:

- Security work
- Infrastructure work
- Architecture changes
- Data migrations

---

# Model Guardrails

## Gemini
Do not:
- Make final architecture decisions
- Approve security changes
- Perform final signoff

## Sonnet
Do not:
- Approve your own work
- Override Opus decisions
- Make major architectural changes without review

## Opus
Do not:
- Perform repository exploration
- Handle routine coding tasks when Sonnet is sufficient
- Rewrite functioning implementations without justification

---

# Recommended Antigravity Workflow

Standard Pull Request Flow:

Gemini (Analysis)
↓
Sonnet 5.5 (Implementation)
↓
Opus 5.5 (Only when escalation or approval is required)
↓
Final Output

---

# Consensus Pattern

When uncertainty is high:

1. Gemini gathers context.
2. Opus provides recommendation.
3. Sonnet implements.
4. Opus validates critical decisions.

---

# Cost Optimization

Fast tasks:
Gemini → Sonnet

Medium-risk tasks:
Gemini → Sonnet

High-risk tasks:
Gemini → Opus → Sonnet

Critical tasks:
Gemini → Opus → Sonnet → Opus Approval
