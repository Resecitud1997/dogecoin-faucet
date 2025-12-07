import React, { useState, useEffect } from 'react';
import { Coins, Wallet, Trophy, Activity, Gift, CheckCircle } from 'lucide-react';

const DogecoinFaucet = () => {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [timeUntilNext, setTimeUntilNext] = useState(0);
  const [tasks, setTasks] = useState([
    { id: 1, name: 'Completar Captcha', reward: 0.5, completed: false, cooldown: 300 },
    { id: 2, name: 'Ver Anuncio', reward: 0.3, completed: false, cooldown: 600 },
    { id: 3, name: 'Encuesta Rápida', reward: 1.0, completed: false, cooldown: 1800 }
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (timeUntilNext > 0) {
        setTimeUntilNext(prev => prev - 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [timeUntilNext]);

  const connectWallet = async () => {
    setConnecting(true);
    try {
      // Simulación de conexión a wallet
      setTimeout(() => {
        setUser({ address: walletAddress });
        setBalance(5.42);
        setConnecting(false);
      }, 1500);
    } catch (error) {
      console.error('Error conectando wallet:', error);
      setConnecting(false);
    }
  };

  const claimReward = async (taskId) => {
    setClaiming(true);
    const task = tasks.find(t => t.id === taskId);
    
    setTimeout(() => {
      setBalance(prev => prev + task.reward);
      setTasks(tasks.map(t => 
        t.id === taskId ? { ...t, completed: true } : t
      ));
      setTimeUntilNext(task.cooldown);
      setClaiming(false);
    }, 2000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const withdrawFunds = () => {
    if (balance < 5) {
      alert('Mínimo de retiro: 5 DOGE');
      return;
    }
    alert(`Retiro de ${balance.toFixed(2)} DOGE iniciado a ${walletAddress}`);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-orange-400 to-yellow-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-100 rounded-full mb-4">
              <Coins className="w-10 h-10 text-yellow-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Dogecoin Faucet</h1>
            <p className="text-gray-600">Gana DOGE completando tareas simples</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dirección de Wallet Dogecoin
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="DxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={connectWallet}
              disabled={!walletAddress || connecting}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white py-3 rounded-lg font-semibold hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              {connecting ? (
                <span className="flex items-center justify-center">
                  <Activity className="animate-spin mr-2" size={20} />
                  Conectando...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <Wallet className="mr-2" size={20} />
                  Conectar Wallet
                </span>
              )}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center text-sm text-gray-600">
              <CheckCircle className="mr-2" size={16} />
              Seguro y verificado
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-orange-400 to-yellow-500 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center">
              <div className="bg-yellow-100 p-3 rounded-full mr-4">
                <Coins className="w-8 h-8 text-yellow-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Dogecoin Faucet</h1>
                <p className="text-sm text-gray-600">{user.address.slice(0, 10)}...{user.address.slice(-8)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Balance Disponible</p>
              <p className="text-3xl font-bold text-yellow-600">{balance.toFixed(2)} DOGE</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Ganado Hoy</p>
                <p className="text-2xl font-bold text-gray-800">2.3 DOGE</p>
              </div>
              <Trophy className="w-10 h-10 text-yellow-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Tareas Completadas</p>
                <p className="text-2xl font-bold text-gray-800">12</p>
              </div>
              <Activity className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Histórico</p>
                <p className="text-2xl font-bold text-gray-800">45.8 DOGE</p>
              </div>
              <Gift className="w-10 h-10 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Tareas Disponibles</h2>
          <div className="space-y-4">
            {tasks.map(task => (
              <div key={task.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{task.name}</h3>
                    <p className="text-sm text-gray-600">
                      Recompensa: <span className="text-yellow-600 font-semibold">+{task.reward} DOGE</span>
                    </p>
                    {task.completed && timeUntilNext > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        Próximo reclamo en: {formatTime(timeUntilNext)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => claimReward(task.id)}
                    disabled={task.completed || claiming || timeUntilNext > 0}
                    className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                  >
                    {task.completed ? 'Completado' : claiming ? 'Procesando...' : 'Reclamar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Withdraw */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Retirar Fondos</h2>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-gray-600">Mínimo de retiro: 5 DOGE</p>
              <p className="text-sm text-gray-500">Los retiros se procesan en 24-48 horas</p>
            </div>
            <button
              onClick={withdrawFunds}
              disabled={balance < 5}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
            >
              Retirar {balance.toFixed(2)} DOGE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DogecoinFaucet;
