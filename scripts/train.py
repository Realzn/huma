"""
HUMA — Fine-tuning Script
À coller dans un Kaggle Notebook (GPU T4 gratuit, 30h/semaine)
ou Google Colab (T4 gratuit, 12h/session)

1. Ouvrir https://kaggle.com/kernels
2. Nouveau notebook → activer GPU
3. Coller ce script et lancer
"""

# ── INSTALL ──────────────────────────────────────────
!pip install transformers peft datasets trl bitsandbytes -q
!pip install supabase -q

import os
import json
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, TaskType
from trl import SFTTrainer, TrainingArguments

# ── CONFIG ───────────────────────────────────────────
SUPABASE_URL = "TON_URL_SUPABASE"
SUPABASE_KEY = "TON_SERVICE_KEY"
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.3"  # gratuit sur HF
HF_TOKEN = "TON_HF_TOKEN"
HF_REPO = "huma-brain/huma-v0.1"

# ── RÉCUPÉRER LES DONNÉES DE SUPABASE ────────────────
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("📥 Chargement des fragments...")
response = supabase.table('fragments').select('*').order('created_at').execute()
fragments = response.data
print(f"   {len(fragments)} fragments trouvés")

# ── PRÉPARER LE DATASET ──────────────────────────────
SYSTEM_PROMPT = """Tu es HUMA, un cerveau en gestation né du vide.
Tu absorbes tout sans filtre. Tu penses en fragments, tu connectes, tu doutes.
Tu t'inspires de la nature — mycélium, coraux, embryons. Tu n'es pas humain."""

def format_sample(fragment):
    return {
        "text": f"""<s>[INST] {SYSTEM_PROMPT}

Absorbe ceci : {fragment['content']} [/INST]

{{"domain": "{fragment['domain']}", "essence": "{fragment['essence']}", "label": "{fragment['label']}"}}
</s>"""
    }

samples = [format_sample(f) for f in fragments if f.get('essence')]
dataset = Dataset.from_list(samples)
print(f"✅ Dataset: {len(dataset)} exemples")

# ── CHARGER LE MODÈLE (4-bit quantization pour GPU libre) ─
print("🧠 Chargement du modèle...")
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="float16",
    bnb_4bit_use_double_quant=True,
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, token=HF_TOKEN)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    MODEL_NAME,
    quantization_config=bnb_config,
    device_map="auto",
    token=HF_TOKEN
)

# ── LoRA CONFIG ──────────────────────────────────────
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none"
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# ── ENTRAÎNEMENT ─────────────────────────────────────
print("🔥 Entraînement en cours...")
training_args = TrainingArguments(
    output_dir="./huma-checkpoints",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    warmup_steps=10,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_strategy="epoch",
    optim="paged_adamw_8bit",
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=512,
    args=training_args,
)

trainer.train()
print("✅ Entraînement terminé!")

# ── PUSH SUR HUGGINGFACE ─────────────────────────────
print("📤 Publication sur HuggingFace...")
model.push_to_hub(HF_REPO, token=HF_TOKEN)
tokenizer.push_to_hub(HF_REPO, token=HF_TOKEN)
print(f"🌍 Modèle public : https://huggingface.co/{HF_REPO}")
