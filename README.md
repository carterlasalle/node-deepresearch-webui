# Deep Research Chat UI

A modern, React-based chat interface for interacting with the deep-research API. Built with Vite for optimal development experience.

## Features

- Real-time chat interface with animated message bubbles
- Server-Sent Events (SSE) for live "thinking" updates
- Expandable progress details with smooth animations
- Modern, responsive design
- Error handling and loading states

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd deep-research-chat
```

2. Install dependencies:
```bash
npm install
```

## Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## API Configuration

The application expects the following API endpoints to be available:

- POST `/api/v1/query` - For submitting queries
- GET `/api/v1/stream/:requestId` - For SSE updates

Make sure your API server is running on `http://localhost:3000`

## Building for Production

Build the application:
```bash
npm run build
```

The built files will be in the `dist` directory.

## Technology Stack

- React
- Vite
- CSS3 with animations
- Server-Sent Events (SSE)

## License

MIT
