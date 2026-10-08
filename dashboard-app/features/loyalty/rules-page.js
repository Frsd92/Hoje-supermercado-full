import Link from 'next/link';
import { ArrowLeft, BookOpen, CircleHelp } from 'lucide-react';

export default function LoyaltyRulesPage() {
  return <article className="section-shell orders-showcase customer-coupons-showcase customer-loyalty-rules-page">
    <header className="section-header orders-header">
      <div>
        <span className="orders-kicker">Programa de fidelidade Hoje</span>
        <h1>Regras de missões e pontos</h1>
        <p>Entenda como acumular pontos, acompanhar missões e resgatar recompensas.</p>
      </div>
      <Link className="loyalty-rules-back" href="/dashboard/fidelidade"><ArrowLeft size={16} aria-hidden="true" />Voltar às missões</Link>
    </header>

    <div className="loyalty-rules-intro">
      <BookOpen size={20} aria-hidden="true" />
      <p>As metas, os pontos, os prazos e os limites de cada campanha são definidos pelo Hoje e aparecem na respectiva missão ou recompensa. As regras abaixo explicam como o programa funciona em geral.</p>
    </div>

    <nav className="loyalty-rules-index" aria-label="Índice das regras">
      <a href="#participacao">Participação</a>
      <a href="#missoes">Missões e ciclos</a>
      <a href="#pontos">Crédito e validade dos pontos</a>
      <a href="#estornos">Cancelamentos e estornos</a>
      <a href="#resgates">Resgates e cupons</a>
      <a href="#gestao">Limites e gestão</a>
    </nav>

    <div className="loyalty-rules-content">
      <section id="participacao" className="loyalty-rules-section">
        <h2>1. Participação</h2>
        <ul>
          <li>O programa é individual e acompanha a conta do cliente identificada pelo e-mail usado nos pedidos. É necessário entrar nessa conta para ver o saldo, o progresso e as recompensas.</li>
          <li>Pontos não são dinheiro, não podem ser transferidos para outra conta e não podem ser sacados.</li>
          <li>Somente pedidos concluídos e com pagamento manual, confirmado ou parcialmente estornado são elegíveis. Pedido em processamento, com pagamento recusado ou cancelado não conta.</li>
          <li>Fazer um pedido não concede pontos imediatamente: o pedido precisa chegar ao status de concluído no ERP.</li>
        </ul>
      </section>

      <section id="missoes" className="loyalty-rules-section">
        <h2>2. Missões e ciclos</h2>
        <p>As missões ativas podem pedir uma primeira compra, um valor acumulado em compras, uma quantidade de pedidos concluídos ou compras em uma categoria específica. Cada cartão mostra a meta, a recompensa e o progresso considerado.</p>
        <ul>
          <li><strong>Primeira compra:</strong> pode ser concluída uma vez por cliente e não se repete semanalmente.</li>
          <li><strong>Valor ou categoria:</strong> o progresso soma os valores elegíveis dentro do ciclo. O valor considera os descontos aplicados; para uma missão por categoria, contam os produtos dessa categoria.</li>
          <li><strong>Frequência:</strong> cada pedido elegível concluído conta para a meta de quantidade.</li>
          <li><strong>Missão semanal:</strong> o ciclo reinicia automaticamente toda segunda-feira à meia-noite, no horário de Brasília (São Paulo). Uma mesma pessoa pode concluir aquela missão uma vez por ciclo.</li>
          <li>Missões de ciclo único não reiniciam. Quando uma missão tiver limite total de recompensas, a quantidade restante aparece no cartão; ao esgotar, ela deixa de conceder pontos.</li>
        </ul>
        <p>Quando uma missão precisa de mais de um pedido para ser concluída, os pontos de missões por valor são distribuídos proporcionalmente entre os pedidos que contribuíram; em missões por quantidade de pedidos, são distribuídos igualmente entre eles.</p>
      </section>

      <section id="pontos" className="loyalty-rules-section">
        <h2>3. Crédito e validade dos pontos</h2>
        <ul>
          <li>Os pontos são creditados somente quando a meta da missão é atingida. A quantidade é a indicada na própria missão; não existe uma conversão fixa entre pontos e reais.</li>
          <li>A validade depende da missão: pode terminar com o ciclo, ocorrer após um número de dias, usar uma data definida ou não expirar. Consulte o cartão da missão e o histórico do saldo.</li>
          <li>Ao resgatar uma recompensa, o sistema usa primeiro os pontos que vencem antes.</li>
          <li>O extrato do Dashboard mostra créditos, resgates e datas de expiração. O saldo considera também estornos processados.</li>
        </ul>
      </section>

      <section id="estornos" className="loyalty-rules-section">
        <h2>4. Cancelamentos e estornos</h2>
        <ul>
          <li>Pedidos cancelados ou totalmente estornados não geram pontos disponíveis.</li>
          <li>Um estorno parcial reduz proporcionalmente os pontos vinculados ao pedido de origem, considerando o valor estornado em relação ao total do pedido.</li>
          <li>Se parte desses pontos já tiver sido resgatada, o saldo pode ficar negativo. Os próximos pontos ganhos compensam esse saldo antes de ficarem disponíveis para novos resgates.</li>
          <li>Um cupom já emitido não é cancelado por causa de um estorno nem pela compensação do saldo negativo.</li>
        </ul>
        <div className="loyalty-rules-example"><strong>Exemplo:</strong> se um pedido gerou 100 pontos e depois metade do valor for estornada, o crédito passa a valer 50 pontos. Se 80 pontos desse crédito já tiverem sido usados, ficam faltando 30; os próximos pontos ganhos cobrem essa diferença.</div>
      </section>

      <section id="resgates" className="loyalty-rules-section">
        <h2>5. Resgates e cupons</h2>
        <ul>
          <li>Cada recompensa informa o custo em pontos, o percentual de desconto, o pedido mínimo e a validade do cupom.</li>
          <li>Ao confirmar o resgate, os pontos são debitados e o cupom é emitido para o e-mail da conta. O resgate é definitivo: pontos não são devolvidos se o cupom não for usado antes de expirar.</li>
          <li>O cupom é pessoal, de uso único e precisa ser usado dentro da validade. Se houver pedido mínimo, ele é calculado sobre o subtotal antes do desconto do cupom.</li>
          <li>É permitido usar um cupom por pedido. O desconto do cupom pode ser combinado com ofertas aplicadas aos produtos.</li>
          <li>Cupons emitidos continuam sujeitos às condições e à validade exibidas, mesmo que a recompensa deixe de estar disponível para novos resgates.</li>
        </ul>
      </section>

      <section id="gestao" className="loyalty-rules-section">
        <h2>6. Limites e gestão das campanhas</h2>
        <ul>
          <li>Uma missão pode ter um limite global de recompensas. Quando esse limite é atingido, ela deixa de conceder novas recompensas.</li>
          <li>O ERP pode pausar ou encerrar uma missão. Depois que alguém inicia o progresso, as regras de avaliação e o prazo ficam protegidos para preservar o histórico; a equipe ainda pode ajustar informações de apresentação e o limite sem reduzir recompensas já concedidas.</li>
          <li>As recompensas podem ser desativadas para impedir novos resgates. Isso não altera cupons que já foram emitidos.</li>
          <li>Confira sempre as condições no cartão: campanhas diferentes podem ter metas, ciclos, pontos, validade e limites diferentes.</li>
        </ul>
      </section>
    </div>

    <div className="loyalty-rules-footer">
      <CircleHelp size={18} aria-hidden="true" />
      <p>Seu saldo e o andamento das campanhas ficam em <Link href="/dashboard/fidelidade">Missões e pontos</Link>. As recompensas resgatadas também aparecem em <Link href="/dashboard/cupons">Meus cupons</Link>.</p>
    </div>
  </article>;
}
