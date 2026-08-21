// 1. Configurações do Supabase (MANTIDAS)
const SUPABASE_URL = '';
const SUPABASE_KEY = '';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const systemStatus = document.getElementById('system-status');

const resultBox = document.getElementById('result-box');
const alunoNome = document.getElementById('aluno-nome');
const alunoMat = document.getElementById('aluno-mat');
const alunoCargo = document.getElementById('aluno-cargo');
const userAvatar = document.getElementById('user-avatar');

// Elementos do Modal de Cadastro
const btnCadastrar = document.getElementById('btn-cadastrar');
const modalCadastro = document.getElementById('modal-cadastro');
const btnFecharModal = document.getElementById('btn-fechar-modal');
const btnConfirmarCadastro = document.getElementById('btn-confirmar-cadastro');

// Inputs do Modal
const cadNome = document.getElementById('cad-nome');
const cadMatricula = document.getElementById('cad-matricula');
const cadCurso = document.getElementById('cad-curso');

let labeledDescriptors = [];
let faceMatcher = null;
let ultimoDescriptorDetectado = null;

// Helper para atualizar o badge de status (Agora com ícone)
function updateStatus(text, color, iconClass) {
  systemStatus.innerHTML = `<i class="fas ${iconClass}"></i> ${text}`;
  systemStatus.style.background = color;
}

// 2. Inicia a API de Câmera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    updateStatus("CÂMERA ATIVA - PRONTO", "var(--success-green)", "fa-check-circle");
  } catch (error) {
    updateStatus("ERRO NA CÂMERA", "var(--primary-red)", "fa-times-circle");
  }
}

// 3. Busca os cadastros do Supabase (MANTIDA)
async function carregarUsuariosDoBanco() {
  updateStatus("BUSCANDO CADASTROS...", "var(--warning-yellow)", "fa-sync fa-spin");
  
  const { data: usuarios, error } = await _supabase.from('usuarios').select('*');

  if (error) {
    console.error("Erro ao buscar usuários:", error);
    updateStatus("ERRO AO CARREGAR BANCO", "var(--primary-red)", "fa-database");
    return;
  }

  if (usuarios && usuarios.length > 0) {
    labeledDescriptors = usuarios.map(user => {
      const descriptorFloat32 = new Float32Array(user.descriptor);
      
      const labelData = JSON.stringify({
        nome: user.nome,
        matricula: user.matricula,
        curso: user.curso
      });

      return new faceapi.LabeledFaceDescriptors(labelData, [descriptorFloat32]);
    });

    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
  }
  updateStatus("CÂMERA ATIVA - PRONTO", "var(--success-green)", "fa-check-circle");
}

// 4. Carrega Modelos da IA e Inicia (MANTIDA)
async function loadModels() {
  updateStatus("CARREGANDO IA...", "var(--warning-yellow)", "fa-brain");
  const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

  await carregarUsuariosDoBanco();
  startCamera();
}

// 5. Loop em Tempo Real (ESTÉTICA MELHORADA)
video.addEventListener('play', () => {
  const displaySize = { width: video.width, height: video.height };
  faceapi.matchDimensions(overlay, displaySize);

  setInterval(async () => {
    const detections = await faceapi.detectAllFaces(
      video, 
      new faceapi.TinyFaceDetectorOptions()
    ).withFaceLandmarks().withFaceDescriptors();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);

    if (detections.length > 0) {
      // Guarda a leitura atual
      ultimoDescriptorDetectado = Array.from(detections[0].descriptor);

      // --- Estética da Detecção de Rosto ---
      resizedDetections.forEach(detection => {
        const box = detection.detection.box;
        // Desenha a caixa vermelha fina do Face-API
        const drawBox = new faceapi.draw.DrawBox(box, { label: '', boxColor: '#e30613', lineWidth: 1 });
        drawBox.draw(overlay);
        
        // Ativa a classe de animação no scanner do HTML
        document.querySelector('.scanner-focus').classList.add('active');
      });

      // --- Lógica de Reconhecimento ---
      if (faceMatcher) {
        const bestMatch = faceMatcher.findBestMatch(detections[0].descriptor);
        
        if (bestMatch.label !== 'unknown') {
          // ACESSO LIBERADO
          const dados = JSON.parse(bestMatch.label);
          resultBox.className = "result-box liberado";
          userAvatar.innerHTML = '<i class="fas fa-check-circle"></i>';
          alunoNome.innerText = dados.nome;
          alunoMat.innerText = "Matrícula: " + dados.matricula;
          alunoCargo.innerText = dados.curso;
        } else {
          // ACESSO NEGADO (Desconhecido)
          resultBox.className = "result-box negado";
          userAvatar.innerHTML = '<i class="fas fa-times-circle"></i>';
          alunoNome.innerText = "Não Identificado";
          alunoMat.innerText = "Acesso Negado";
          alunoCargo.innerText = "--";
        }
      } else {
        // BANCO VAZIO
        resultBox.className = "result-box negado";
        userAvatar.innerHTML = '<i class="fas fa-database"></i>';
        alunoNome.innerText = "Sem Dados";
        alunoMat.innerText = "Clique em Cadastrar";
        alunoCargo.innerText = "--";
      }

    } else {
      // SEM ROSTO NA CÂMERA
      ultimoDescriptorDetectado = null;
      document.querySelector('.scanner-focus').classList.remove('active');
      resultBox.className = "result-box standby";
      userAvatar.innerHTML = '<i class="fas fa-user"></i>';
      alunoNome.innerText = "Aguardando...";
      alunoMat.innerText = "--";
      alunoCargo.innerText = "--";
    }

  }, 300);
});

// 6. Lógica do Modal de Cadastro (NOVO - Substitui os prompt)

// Abre o modal
btnCadastrar.addEventListener('click', () => {
  if (!ultimoDescriptorDetectado) {
    // Usando o alert padrão, mas poderia ser um modal de aviso
    alert("❌ Posicione seu rosto em frente à câmera antes de cadastrar!");
    return;
  }
  // Limpa os campos
  cadNome.value = '';
  cadMatricula.value = '';
  cadCurso.value = '';
  // Exibe o modal
  modalCadastro.style.display = "block";
});

// Fecha o modal
btnFecharModal.addEventListener('click', () => {
  modalCadastro.style.display = "none";
});

// Fecha se clicar fora do conteúdo
window.addEventListener('click', (event) => {
  if (event.target == modalCadastro) {
    modalCadastro.style.display = "none";
  }
});

// Confirma e envia para o Supabase
btnConfirmarCadastro.addEventListener('click', async () => {
  const nome = cadNome.value.trim();
  const matricula = cadMatricula.value.trim();
  const curso = cadCurso.value.trim();

  // Validação simples
  if (!nome || !matricula || !curso) {
    alert("⚠️ Por favor, preencha todos os campos.");
    return;
  }

  // Desabilita botão e muda status
  btnConfirmarCadastro.innerText = "Processando...";
  btnConfirmarCadastro.disabled = true;
  updateStatus("SALVANDO NO BANCO...", "var(--warning-yellow)", "fa-save fa-spin");

  // Envia pro Supabase (Lógica mantida)
  const { data, error } = await _supabase.from('usuarios').insert([
    {
      nome: nome,
      matricula: matricula,
      curso: curso,
      descriptor: ultimoDescriptorDetectado
    }
  ]);

  if (error) {
    alert("❌ Erro ao cadastrar: " + error.message);
    updateStatus("ERRO NO CADASTRO", "var(--primary-red)", "fa-times-circle");
  } else {
    alert(`✅ Sucesso! ${nome} foi cadastrado.`);
    modalCadastro.style.display = "none"; // Fecha modal
    await carregarUsuariosDoBanco(); // Recarrega IA
  }

  // Restaura botão
  btnConfirmarCadastro.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Cadastro';
  btnConfirmarCadastro.disabled = false;
});

loadModels();
