# Ollama Integration Guide

Ollama support allows you to use local AI models for complete privacy and offline functionality.

## Quick Setup

### 1. Install Ollama
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows (WSL)
curl -fsSL https://ollama.ai/install.sh | sh
```

### 2. Start Ollama Server
```bash
# Start the server
ollama serve

# Default endpoint: http://localhost:11434
```

### 3. Download a Model
```bash
# Recommended models for Cowork Lite
ollama pull llama2
ollama pull codellama
ollama pull mistral

# List available models
ollama list
```

### 4. Configure Cowork Lite
```bash
# Set environment variables
export AI_PROVIDER=ollama
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama2

# Or create .env file
echo "AI_PROVIDER=ollama" > .env
echo "OLLAMA_BASE_URL=http://localhost:11434" >> .env
echo "OLLAMA_MODEL=llama2" >> .env
```

## Usage

Once configured, Cowork Lite will automatically use Ollama for all AI-powered features:

```bash
# File organization with local AI
npm run dev "organize documents by content" ./documents

# Report generation with privacy
npm run dev "analyze sensitive financial data" ./financial --ai-recommendations

# Works with dry-run mode
npm run dev "plan document reorganization" ./docs --dry-run
```

## Benefits

- 🔒 **100% Private**: No data ever leaves your system
- 💰 **No Cost**: No per-token API charges
- 🌐 **Offline**: Works without internet connection
- ⚡ **Fast**: Local inference with minimal latency
- 🎯 **Customizable**: Use any compatible model

## Troubleshooting

### Connection Issues
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Check available models
curl http://localhost:11434/api/tags
```

### Model Performance
- **llama2**: Good all-around performance
- **codellama**: Excellent for code analysis
- **mistral**: Fast and efficient
- **qwen**: Great for reasoning tasks

### Common Issues

**Issue**: "Ollama not configured"
- **Solution**: Ensure `OLLAMA_BASE_URL` is set correctly

**Issue**: "No response from Ollama"
- **Solution**: Check Ollama server is running and model is downloaded

**Issue**: Poor performance
- **Solution**: Try smaller models or ensure sufficient RAM

## Advanced Configuration

### Custom Model Parameters
```bash
# Override model settings
OLLAMA_MODEL=llama2:7b
OLLAMA_BASE_URL=http://localhost:11434

# Use GPU acceleration (if available)
OLLAMA_BASE_URL=http://localhost:11434/gpu
```

### Multiple Model Support
Ollama can serve multiple models simultaneously. Set the preferred model with:
```bash
export OLLAMA_MODEL=mistral  # Switch to Mistral
```

## Integration with Existing Workflows

Ollama integrates seamlessly with all existing Cowork Lite features:

- ✅ **File Organization**: Smart categorization using local AI
- ✅ **Report Generation**: Content analysis without cloud dependency  
- ✅ **Data Extraction**: Pattern recognition with privacy
- ✅ **Natural Language Tasks**: Complex instruction understanding
- ✅ **Safety Features**: All safety checks still apply

## Performance Tips

1. **RAM Requirements**: Minimum 8GB RAM for 7B models
2. **Model Selection**: Smaller models for faster inference
3. **Parallel Processing**: Ollama handles concurrent requests efficiently
4. **Caching**: Cowork Lite caches results to reduce AI calls

For more information, see [Ollama Documentation](https://github.com/ollama/ollama).